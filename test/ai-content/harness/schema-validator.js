/**
 * Schema Validator for AI Development Content Generator Outputs
 * Implements strict schema validation against DevelopmentSessionReport contract in PROJECT.md
 */

const { assert } = require('../../harness/assertions');

const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const SHA_40_REGEX = /^[0-9a-f]{40}$/i;
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validates a DevelopmentSessionReport JSON object against PROJECT.md specifications:
 * - commit_sha: str (40-char canonical hex)
 * - timestamp: str (ISO-8601)
 * - summary: str
 * - architecture_impact: str
 * - key_takeaways: List[str]
 * - changed_components: List[str]
 * - suggested_article_title: str
 * - suggested_article_slug: str
 */
function validateSessionReport(data, expectedSha = null) {
  assert.ok(data && typeof data === 'object', 'Report must be a non-null JSON object');

  // 1. commit_sha
  assert.ok(typeof data.commit_sha === 'string', 'commit_sha must be a string');
  assert.match(data.commit_sha, SHA_40_REGEX, 'commit_sha must be a 40-character hexadecimal string');
  if (expectedSha) {
    assert.strictEqual(
      data.commit_sha.toLowerCase(),
      expectedSha.toLowerCase(),
      `commit_sha should match expected SHA ${expectedSha}`
    );
  }

  // 2. timestamp
  assert.ok(typeof data.timestamp === 'string', 'timestamp must be a string');
  assert.match(data.timestamp, ISO_8601_REGEX, 'timestamp must be a valid ISO-8601 formatted date string');

  // 3. summary
  assert.ok(typeof data.summary === 'string', 'summary must be a string');
  assert.ok(data.summary.trim().length > 0, 'summary must not be empty');

  // 4. architecture_impact
  assert.ok(typeof data.architecture_impact === 'string', 'architecture_impact must be a string');
  assert.ok(data.architecture_impact.trim().length > 0, 'architecture_impact must not be empty');

  // 5. key_takeaways
  assert.ok(Array.isArray(data.key_takeaways), 'key_takeaways must be an array');
  assert.isAbove(data.key_takeaways.length, 0, 'key_takeaways must contain at least 1 item');
  for (let i = 0; i < data.key_takeaways.length; i++) {
    assert.ok(
      typeof data.key_takeaways[i] === 'string' && data.key_takeaways[i].trim().length > 0,
      `key_takeaways[${i}] must be a non-empty string`
    );
  }

  // 6. changed_components
  assert.ok(Array.isArray(data.changed_components), 'changed_components must be an array');

  // 7. suggested_article_title
  assert.ok(typeof data.suggested_article_title === 'string', 'suggested_article_title must be a string');
  assert.ok(data.suggested_article_title.trim().length > 0, 'suggested_article_title must not be empty');

  // 8. suggested_article_slug
  assert.ok(typeof data.suggested_article_slug === 'string', 'suggested_article_slug must be a string');
  assert.match(data.suggested_article_slug, SLUG_REGEX, 'suggested_article_slug must be valid kebab-case');

  return true;
}

/**
 * Validates Technical Article markdown content
 */
function validateTechnicalArticle(content, expectedTitle = null) {
  assert.ok(typeof content === 'string', 'Technical article content must be a string');
  assert.ok(content.trim().length >= 50, 'Technical article must have substantial content (>= 50 chars)');
  
  // Must contain an H1 markdown title
  assert.match(content, /^#\s+.+/m, 'Technical article must contain a top-level H1 markdown heading');

  if (expectedTitle) {
    assert.includes(content, expectedTitle, `Technical article must contain suggested title "${expectedTitle}"`);
  }

  return true;
}

/**
 * Validates Dev Journal markdown content
 */
function validateDevJournal(content, expectedSha = null) {
  assert.ok(typeof content === 'string', 'Journal content must be a string');
  assert.ok(content.trim().length >= 30, 'Journal content must not be empty');
  
  // Must contain a header or timestamp or commit reference
  assert.match(content, /^#+\s+/m, 'Journal must contain markdown headers');

  if (expectedSha) {
    const shortSha = expectedSha.slice(0, 7);
    const hasSha = content.includes(expectedSha) || content.includes(shortSha);
    assert.ok(hasSha, `Journal should reference the commit SHA (${shortSha} or full SHA)`);
  }

  return true;
}

/**
 * Validates Social/Twitter Thread markdown content
 */
function validateSocialThread(content) {
  assert.ok(typeof content === 'string', 'Social thread content must be a string');
  assert.ok(content.trim().length >= 20, 'Social thread content must not be empty');

  // Must contain numbered thread items or tweet delimiters (e.g. "1/", "1/n", "---", or tweet indicators)
  const hasThreadIndicators = /(?:1\/\d*|🧵|Tweet \d|---|\n\n)/i.test(content);
  assert.ok(hasThreadIndicators, 'Social thread must contain thread structuring');

  return true;
}

module.exports = {
  validateSessionReport,
  validateTechnicalArticle,
  validateDevJournal,
  validateSocialThread,
  ISO_8601_REGEX,
  SHA_40_REGEX,
  SLUG_REGEX
};
