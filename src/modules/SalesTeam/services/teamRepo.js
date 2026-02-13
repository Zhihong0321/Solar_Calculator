/**
 * Team Repository - SIMPLE VERSION
 */
const pool = require('../../../core/database/pool');

/**
 * Get all teams with their members
 */
async function getTeamsWithMembers(client = pool) {
  // Simple: get all users
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
  `);

  // Group in JS - no complex SQL
  const teams = {};
  const unassigned = [];

  result.rows.forEach(user => {
    const teamTag = (user.access_level || []).find(t => t && t.startsWith('team-'));
    if (teamTag) {
      if (!teams[teamTag]) teams[teamTag] = [];
      teams[teamTag].push(user);
    } else {
      unassigned.push(user);
    }
  });

  return { teams, unassigned };
}

/**
 * Get all users without team - not needed, included in getTeamsWithMembers
 */
async function getUsersWithoutTeam(client = pool) {
  return [];
}

/**
 * Assign user to team
 */
async function assignUserToTeam(userId, teamTag, client = pool) {
  // Get current access_level
  const { rows } = await client.query(
    'SELECT access_level FROM "user" WHERE id::text = $1 OR bubble_id = $1',
    [String(userId)]
  );
  if (!rows.length) throw new Error('User not found');

  const current = rows[0].access_level || [];
  const filtered = current.filter(t => !t.startsWith('team-'));
  filtered.push(teamTag);

  await client.query(
    'UPDATE "user" SET access_level = $1, updated_at = NOW() WHERE id::text = $2 OR bubble_id = $2',
    [filtered, String(userId)]
  );

  return { success: true };
}

/**
 * Remove user from team
 */
async function removeUserFromTeam(userId, client = pool) {
  const { rows } = await client.query(
    'SELECT access_level FROM "user" WHERE id::text = $1 OR bubble_id = $1',
    [String(userId)]
  );
  if (!rows.length) throw new Error('User not found');

  const current = rows[0].access_level || [];
  const filtered = current.filter(t => !t.startsWith('team-'));

  await client.query(
    'UPDATE "user" SET access_level = $1, updated_at = NOW() WHERE id::text = $2 OR bubble_id = $2',
    [filtered, String(userId)]
  );

  return { success: true };
}

/**
 * Check HR access
 */
async function hasHRAccess(userId, client = pool) {
  const { rows } = await client.query(
    'SELECT access_level FROM "user" WHERE id::text = $1 OR bubble_id = $1',
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
