/**
 * Team Repository - SIMPLE VERSION
 */
const pool = require('../../../core/database/pool');

/**
 * Get all teams with their members
 * ONE query, done.
 */
async function getTeamsWithMembers(client = pool) {
  // Get all users with any team-* tag
  const result = await client.query(`
    SELECT 
      u.id,
      u.bubble_id,
      u.email,
      u.access_level,
      u.profile_picture,
      a.name
    FROM "user" u
    LEFT JOIN agent a ON u.linked_agent_profile = a.bubble_id
    WHERE u.access_level && ARRAY(
      SELECT unnest(u2.access_level) FROM "user" u2 WHERE u2.id = u.id AND unnest(u2.access_level) LIKE 'team-%'
    )
  `);
  
  // Group by team in JS
  const teams = {};
  result.rows.forEach(user => {
    const teamTag = (user.access_level || []).find(t => t.startsWith('team-'));
    if (teamTag) {
      if (!teams[teamTag]) teams[teamTag] = [];
      teams[teamTag].push(user);
    }
  });
  
  return teams;
}

/**
 * Get all users without team
 */
async function getUsersWithoutTeam(client = pool) {
  const result = await client.query(`
    SELECT 
      u.id,
      u.bubble_id,
      u.email,
      u.access_level,
      u.profile_picture,
      a.name
    FROM "user" u
    LEFT JOIN agent a ON u.linked_agent_profile = a.bubble_id
    WHERE NOT EXISTS (
      SELECT 1 FROM unnest(u.access_level) t WHERE t LIKE 'team-%'
    )
  `);
  return result.rows;
}

/**
 * Assign user to team
 */
async function assignUserToTeam(userId, teamTag, client = pool) {
  // Get current access_level
  const { rows } = await client.query(
    'SELECT access_level FROM "user" WHERE id = $1 OR bubble_id = $1',
    [String(userId)]
  );
  if (!rows.length) throw new Error('User not found');
  
  const current = rows[0].access_level || [];
  const filtered = current.filter(t => !t.startsWith('team-'));
  filtered.push(teamTag);
  
  await client.query(
    'UPDATE "user" SET access_level = $1, updated_at = NOW() WHERE id = $2 OR bubble_id = $2',
    [filtered, String(userId)]
  );
  
  return { success: true };
}

/**
 * Remove user from team
 */
async function removeUserFromTeam(userId, client = pool) {
  const { rows } = await client.query(
    'SELECT access_level FROM "user" WHERE id = $1 OR bubble_id = $1',
    [String(userId)]
  );
  if (!rows.length) throw new Error('User not found');
  
  const current = rows[0].access_level || [];
  const filtered = current.filter(t => !t.startsWith('team-'));
  
  await client.query(
    'UPDATE "user" SET access_level = $1, updated_at = NOW() WHERE id = $2 OR bubble_id = $2',
    [filtered, String(userId)]
  );
  
  return { success: true };
}

/**
 * Check HR access
 */
async function hasHRAccess(userId, client = pool) {
  const { rows } = await client.query(
    'SELECT access_level FROM "user" WHERE id = $1 OR bubble_id = $1',
    [String(userId)]
  );
  if (!rows.length) return false;
  return (rows[0].access_level || []).includes('hr');
}

module.exports = {
  getTeamsWithMembers,
  getUsersWithoutTeam,
  assignUserToTeam,
  removeUserFromTeam,
  hasHRAccess
};
