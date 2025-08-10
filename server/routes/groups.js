const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Multer configuration for group avatar uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/groups/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'group-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Get user's groups
router.get('/', authMiddleware, async (req, res) => {
  try {
    const groups = await db.query(`
      SELECT 
        g.id,
        g.name,
        g.description,
        g.avatar_url,
        g.owner_id,
        g.created_at,
        gm.role as user_role,
        (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
      FROM groups g
      JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_id = $1
      ORDER BY g.name
    `, [req.user.id]);

    // Get last message for each group separately
    const groupsWithMessages = await Promise.all(
      groups.rows.map(async (group) => {
        const lastMessageResult = await db.query(`
          SELECT 
            m.id,
            m.content,
            m.message_type,
            m.created_at,
            u.display_name as sender_name
          FROM messages m
          JOIN conversations c ON m.conversation_id = c.id
          JOIN users u ON m.sender_id = u.id
          WHERE c.group_id = $1
          ORDER BY m.created_at DESC
          LIMIT 1
        `, [group.id]);

        return {
          ...group,
          last_message: lastMessageResult.rows[0] || null
        };
      })
    );

    res.json(groupsWithMessages);
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Create new group
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, description, memberIds = [] } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    if (name.length > 100) {
      return res.status(400).json({ error: 'Group name must be less than 100 characters' });
    }

    if (description && description.length > 500) {
      return res.status(400).json({ error: 'Group description must be less than 500 characters' });
    }

    // Verify all member IDs are valid and are contacts of the creator
    if (memberIds.length > 0) {
      const validMembers = await db.query(`
        SELECT DISTINCT 
          CASE 
            WHEN c.user_id = $1 THEN c.contact_id
            ELSE c.user_id
          END as user_id
        FROM contacts c
        WHERE (c.user_id = $1 OR c.contact_id = $1) 
        AND c.status = 'accepted'
        AND (
          CASE 
            WHEN c.user_id = $1 THEN c.contact_id
            ELSE c.user_id
          END
        ) = ANY($2)
      `, [req.user.id, memberIds]);

      if (validMembers.rows.length !== memberIds.length) {
        return res.status(400).json({ error: 'All members must be your contacts' });
      }
    }

    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Create group
      const groupResult = await client.query(
        'INSERT INTO groups (name, description, owner_id) VALUES ($1, $2, $3) RETURNING id, name, description, avatar_url, created_at',
        [name.trim(), description || null, req.user.id]
      );

      const group = groupResult.rows[0];

      // Add creator as admin
      await client.query(
        'INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3)',
        [group.id, req.user.id, 'admin']
      );

      // Add other members
      if (memberIds.length > 0) {
        const memberValues = memberIds.map((memberId, index) => 
          `($1, $${index + 2}, 'member')`
        ).join(', ');

        await client.query(
          `INSERT INTO group_members (group_id, user_id, role) VALUES ${memberValues}`,
          [group.id, ...memberIds]
        );
      }

      // Create conversation for the group
      const conversationResult = await client.query(
        'INSERT INTO conversations (type, group_id) VALUES ($1, $2) RETURNING id',
        ['group', group.id]
      );

      await client.query('COMMIT');

      res.status(201).json({
        ...group,
        conversationId: conversationResult.rows[0].id,
        memberCount: memberIds.length + 1
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// Get group details
router.get('/:groupId', authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params;

    // Verify user is a member of the group
    const memberCheck = await db.query(
      'SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user.id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this group' });
    }

    const userRole = memberCheck.rows[0].role;

    // Get group details
    const groupResult = await db.query(`
      SELECT 
        g.id,
        g.name,
        g.description,
        g.avatar_url,
        g.owner_id,
        g.created_at,
        u.display_name as owner_name
      FROM groups g
      JOIN users u ON g.owner_id = u.id
      WHERE g.id = $1
    `, [groupId]);

    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const group = groupResult.rows[0];

    // Get group members
    const membersResult = await db.query(`
      SELECT 
        u.id,
        u.username,
        u.display_name,
        u.avatar_url,
        u.status,
        gm.role,
        gm.joined_at
      FROM group_members gm
      JOIN users u ON gm.user_id = u.id
      WHERE gm.group_id = $1
      ORDER BY 
        CASE gm.role WHEN 'admin' THEN 1 ELSE 2 END,
        u.display_name
    `, [groupId]);

    res.json({
      ...group,
      userRole,
      members: membersResult.rows
    });
  } catch (error) {
    console.error('Get group details error:', error);
    res.status(500).json({ error: 'Failed to fetch group details' });
  }
});

// Update group details
router.put('/:groupId', authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { name, description } = req.body;

    // Verify user is admin or owner
    const memberCheck = await db.query(
      'SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user.id]
    );

    if (memberCheck.rows.length === 0 || memberCheck.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Only group admins can update group details' });
    }

    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Group name cannot be empty' });
      }
      if (name.length > 100) {
        return res.status(400).json({ error: 'Group name must be less than 100 characters' });
      }
      updateFields.push(`name = $${paramCount++}`);
      values.push(name.trim());
    }

    if (description !== undefined) {
      if (description && description.length > 500) {
        return res.status(400).json({ error: 'Group description must be less than 500 characters' });
      }
      updateFields.push(`description = $${paramCount++}`);
      values.push(description || null);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(groupId);

    const query = `UPDATE groups SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING id, name, description, avatar_url`;

    const result = await db.query(query, values);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

// Upload group avatar
router.post('/:groupId/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Verify user is admin
    const memberCheck = await db.query(
      'SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user.id]
    );

    if (memberCheck.rows.length === 0 || memberCheck.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Only group admins can update group avatar' });
    }

    const avatarUrl = `/uploads/groups/${req.file.filename}`;

    const result = await db.query(
      'UPDATE groups SET avatar_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING avatar_url',
      [avatarUrl, groupId]
    );

    res.json({ avatarUrl: result.rows[0].avatar_url });
  } catch (error) {
    console.error('Upload group avatar error:', error);
    res.status(500).json({ error: 'Failed to upload group avatar' });
  }
});

// Add members to group
router.post('/:groupId/members', authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { memberIds } = req.body;

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ error: 'Member IDs array is required' });
    }

    // Verify user is admin
    const memberCheck = await db.query(
      'SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user.id]
    );

    if (memberCheck.rows.length === 0 || memberCheck.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Only group admins can add members' });
    }

    // Verify all new members are contacts and not already in group
    const validMembers = await db.query(`
      SELECT DISTINCT 
        CASE 
          WHEN c.user_id = $1 THEN c.contact_id
          ELSE c.user_id
        END as user_id
      FROM contacts c
      LEFT JOIN group_members gm ON (
        CASE 
          WHEN c.user_id = $1 THEN c.contact_id
          ELSE c.user_id
        END
      ) = gm.user_id AND gm.group_id = $2
      WHERE (c.user_id = $1 OR c.contact_id = $1) 
      AND c.status = 'accepted'
      AND gm.id IS NULL
      AND (
        CASE 
          WHEN c.user_id = $1 THEN c.contact_id
          ELSE c.user_id
        END
      ) = ANY($3)
    `, [req.user.id, groupId, memberIds]);

    if (validMembers.rows.length !== memberIds.length) {
      return res.status(400).json({ error: 'Some users are not your contacts or are already group members' });
    }

    // Add members
    const memberValues = memberIds.map((memberId, index) => 
      `($1, $${index + 2}, 'member')`
    ).join(', ');

    await db.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ${memberValues}`,
      [groupId, ...memberIds]
    );

    res.json({ message: 'Members added successfully' });
  } catch (error) {
    console.error('Add group members error:', error);
    res.status(500).json({ error: 'Failed to add members' });
  }
});

// Remove member from group
router.delete('/:groupId/members/:memberId', authMiddleware, async (req, res) => {
  try {
    const { groupId, memberId } = req.params;

    // Verify user is admin or removing themselves
    const memberCheck = await db.query(
      'SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user.id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this group' });
    }

    const isAdmin = memberCheck.rows[0].role === 'admin';
    const isSelf = parseInt(memberId) === req.user.id;

    if (!isAdmin && !isSelf) {
      return res.status(403).json({ error: 'Only admins can remove other members' });
    }

    // Check if member exists in group
    const targetMember = await db.query(
      'SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, memberId]
    );

    if (targetMember.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found in group' });
    }

    // Cannot remove group owner
    const groupOwner = await db.query('SELECT owner_id FROM groups WHERE id = $1', [groupId]);
    if (parseInt(memberId) === groupOwner.rows[0].owner_id) {
      return res.status(400).json({ error: 'Cannot remove group owner' });
    }

    // Remove member
    await db.query(
      'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, memberId]
    );

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Remove group member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Update member role
router.put('/:groupId/members/:memberId/role', authMiddleware, async (req, res) => {
  try {
    const { groupId, memberId } = req.params;
    const { role } = req.body;

    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Verify user is admin
    const memberCheck = await db.query(
      'SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user.id]
    );

    if (memberCheck.rows.length === 0 || memberCheck.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Only group admins can change member roles' });
    }

    // Cannot change owner role
    const groupOwner = await db.query('SELECT owner_id FROM groups WHERE id = $1', [groupId]);
    if (parseInt(memberId) === groupOwner.rows[0].owner_id) {
      return res.status(400).json({ error: 'Cannot change group owner role' });
    }

    // Update member role
    const result = await db.query(
      'UPDATE group_members SET role = $1 WHERE group_id = $2 AND user_id = $3',
      [role, groupId, memberId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Member not found in group' });
    }

    res.json({ message: 'Member role updated successfully' });
  } catch (error) {
    console.error('Update member role error:', error);
    res.status(500).json({ error: 'Failed to update member role' });
  }
});

// Leave group
router.post('/:groupId/leave', authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params;

    // Check if user is group owner
    const groupOwner = await db.query('SELECT owner_id FROM groups WHERE id = $1', [groupId]);
    if (groupOwner.rows.length > 0 && groupOwner.rows[0].owner_id === req.user.id) {
      return res.status(400).json({ error: 'Group owner cannot leave group. Transfer ownership first or delete the group.' });
    }

    // Remove user from group
    const result = await db.query(
      'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'You are not a member of this group' });
    }

    res.json({ message: 'Left group successfully' });
  } catch (error) {
    console.error('Leave group error:', error);
    res.status(500).json({ error: 'Failed to leave group' });
  }
});

// Delete group (owner only)
router.delete('/:groupId', authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params;

    // Verify user is group owner
    const groupCheck = await db.query(
      'SELECT owner_id FROM groups WHERE id = $1',
      [groupId]
    );

    if (groupCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (groupCheck.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only group owner can delete the group' });
    }

    // Delete group (cascade will handle related records)
    await db.query('DELETE FROM groups WHERE id = $1', [groupId]);

    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

module.exports = router;