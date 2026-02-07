const { customAlphabet } = require('nanoid');

const generateReferralCode = (name, prefix = '') => {
  const nanoid = customAlphabet('0123456789', 2);
  const cleanName = name
    .split(' ')[0]
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 8);

  const randomNum = nanoid();
  const code = prefix ? `${prefix}${cleanName}${randomNum}` : `${cleanName}${randomNum}`;

  return code;
};

const generateApiKey = () => {
  const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 32);
  return `patf_${nanoid()}`;
};

const generateBusinessId = () => {
  const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);
  return `biz_${nanoid()}`;
};

module.exports = { generateReferralCode, generateApiKey, generateBusinessId };
