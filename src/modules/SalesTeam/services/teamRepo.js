/**
 * Team Repository
 * Database operations for sales team management
 */
const pool = require('../../../core/database/pool');

/**
 * Get all users with any team-* tag
 * Simple: just get users and their team assignment
 */
async function getAllPersonnel(client = pool) {
  const result = await client.query(`
    SELECT 
      u.id,
      u.bubble_id,
      u.email,
      u.access_level,
      u.profile_picture,
      u.linked_agent_profile,
      a.name,
      a.contact,
      a.agent_type,
      (
        SELECT unnest(u.access_level) 
        WHERE unnest(u.access_level) LIKE 'team-%'
        LIMIT 1
      ) as team_tag
    FROM "user" u
    LEFT JOIN agent a ON (u.linked_agent_profile = a.bubble_id OR a.linked_user_login = u.bubble_id)
    WHERE EXISTS (
      SELECT 1 FROM unnest(u.access_level) tag WHERE tag LIKE 'team-%'
    )
    ORDER BY a.name
  `);
  
  return result.rows;
}

/**
 * Get all unique team-* tags currently in use
 */
async function getAllTeams(client = pool) {
  const result = await client.query(`
    SELECT DISTINCT tag as team_tag
    FROM "user", unnest(access_level) as tag
    WHERE tag LIKE 'team-%'
    ORDER BY tag
  `);
  
  return result.rows.map(r => r.team_tag);
}

/**
 * Get team members for a specific team
 */
async function getTeamMembers(teamTag, client = pool) {
  const result = await client.query(`
    SELECT 
      u.id,
      u.bubble_id,
      u.email,
      u.access_level,
      u.profile_picture,
      u.linked_agent_profile,
      a.name,
      a.contact,
      a.agent_type
    FROM "user" u
    LEFT JOIN agent a ON (u.linked_agent_profile = a.bubble_id OR a.linked_user_login = u.bubble_id)
    WHERE $1 = ANY(u.access_level)
    ORDER BY a.name
  `, [teamTag]);
  
  return result.rows;
}

/**
 * Get all users without a team assignment
 */
async function getUnassignedPersonnel(client = pool) {
  const result = await client.query(`
    SELECT 
      u.id,
      u.bubble_id,
      u.email,
      u.access_level,
      u.profile_picture,
      u.linked_agent_profile,
      a.name,
      a.contact,
      a.agent_type
    FROM "user" u
    LEFT JOIN agent a ON (u.linked_agent_profile = a.bubble_id OR a.linked_user_login = u.bubble_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM unnest(u.access_level) tag WHERE tag LIKE 'team-%'
    )
    ORDER BY a.name
  `);
  
  return result.rows;
}

/**
 * Create a new team by adding the team tag to access_level
 * Returns true if successful
 */
async function createTeam(teamTag, client = pool) {
  // Validate team tag format
  if (!teamTag || !teamTag.match(/^team-[a-z0-9-]+$/i)) {
    throw new Error('Invalid team tag format. Must be "team-xxxx"');
  }
  
  // Check if team already exists
  const existing = await client.query(`
    SELECT 1 FROM "user"
    WHERE $1 = ANY(access_level)
    LIMIT 1
  `, [teamTag]);
  
  if (existing.rows.length > 0) {
    throw new Error(`Team "${teamTag}" already exists`);
  }
  
  // Teams are virtual - they exist when users have the tag
  // Return success to indicate the team name is valid and available
  return { 
    success: true, 
    teamTag,
    message: `Team "${teamTag}" is ready for use` 
  };
}

/**
 * Assign a user to a team
 * Removes any existing team tag and adds the new one
 */
async function assignToTeam(userId, teamTag, client = pool) {
  // Validate team tag format
  if (!teamTag || !teamTag.match(/^team-[a-z0-9-]+$/i)) {
    throw new Error('Invalid team tag format. Must be "team-xxxx"');
  }
  
  // Get current access_level
  const currentResult = await client.query(`
    SELECT access_level FROM "user" 
    WHERE id::text = $1 OR bubble_id = $1
  `, [String(userId)]);
  
  if (currentResult.rows.length === 0) {
    throw new Error('User not found');
  }
  
  const currentAccess = currentResult.rows[0].access_level || [];
  
  // Remove any existing team-* tags
  const newAccess = currentAccess.filter(tag => !tag.startsWith('team-'));
  
  // Add new team tag
  newAccess.push(teamTag);
  
  // Update the user
  const updateResult = await client.query(`
    UPDATE "user"
    SET access_level = $1, updated_at = NOW()
    WHERE id::text = $2 OR bubble_id = $2
    RETURNING id, bubble_id, email, access_level
  `, [newAccess, String(userId)]);
  
  return updateResult.rows[0];
}

/**
 * Remove a user from their current team
 */
async function removeFromTeam(userId, client = pool) {
  // Get current access_level
  const currentResult = await client.query(`
    SELECT access_level FROM "user" 
    WHERE id::text = $1 OR bubble_id = $1
  `, [String(userId)]);
  
  if (currentResult.rows.length === 0) {
    throw new Error('User not found');
  }
  
  const currentAccess = currentResult.rows[0].access_level || [];
  
  // Remove any team-* tags
  const newAccess = currentAccess.filter(tag => !tag.startsWith('team-'));
  
  // Update the user
  const updateResult = await client.query(`
    UPDATE "user"
    SET access_level = $1, updated_at = NOW()
    WHERE id::text = $2 OR bubble_id = $2
    RETURNING id, bubble_id, email, access_level
  `, [newAccess, String(userId)]);
  
  return updateResult.rows[0];
}

/**
 * Move a user from one team to another
 */
async function moveUserToTeam(userId, newTeamTag, client = pool) {
  return assignToTeam(userId, newTeamTag, client);
}

/**
 * Check if user has HR access
 */
async function hasHRAccess(userId, client = pool) {
  const result = await client.query(`
    SELECT access_level FROM "user"
    WHERE id::text = $1 OR bubble_id = $1
    LIMIT 1
  `, [String(userId)]);
  
  if (result.rows.length === 0) {
    return false;
  }
  
  const accessLevel = result.rows[0].access_level || [];
  return accessLevel.includes('hr');
}

/**
 * Get team statistics
 */
async function getTeamStats(teamTag, client = pool) {
  const result = await client.query(`
    SELECT 
      COUNT(*) as member_count
    FROM "user" u
    WHERE $1 = ANY(u.access_level)
  `, [teamTag]);
  
  return result.rows[0];
}

module.exports = {
  getAllPersonnel,
  getAllTeams,
  getTeamMembers,
  getUnassignedPersonnel,
  createTeam,
  assignToTeam,
  removeFromTeam,
  moveUserToTeam,
  hasHRAccess,
  getTeamStats
};
