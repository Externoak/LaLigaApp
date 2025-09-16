import DOMPurify from 'dompurify';

export const sanitizePlayerName = (name) => {
  if (!name || typeof name !== 'string') return '';
  return DOMPurify.sanitize(name, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim().slice(0, 100);
};

export const validateClauseAmount = (amount) => {
  const numAmount = parseFloat(amount);
  return numAmount > 0 && numAmount <= 200000000 && !isNaN(numAmount);
};

export const sanitizeSearchTerm = (term) => {
  if (!term || typeof term !== 'string') return '';
  return DOMPurify.sanitize(term, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim().slice(0, 50);
};

export const validateLeagueId = (id) => {
  return /^[a-zA-Z0-9-]{1,50}$/.test(id);
};

export const sanitizeUserInput = (input, maxLength = 1000) => {
  if (!input || typeof input !== 'string') return '';
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: ['b', 'i', 'em', 'strong'], ALLOWED_ATTR: [] })
    .trim()
    .slice(0, maxLength);
};

