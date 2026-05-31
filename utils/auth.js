// server/utils/auth.js
// 비밀번호 암호화 및 검증을 위한 유틸리티

const bcrypt = require('bcryptjs');

/**
 * 비밀번호를 암호화(Hashing)합니다.
 * @param {string} password 평문 비밀번호
 * @returns {Promise<string>} 암호화된 비밀번호
 */
const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
};

/**
 * 입력된 비밀번호와 저장된 암호화된 비밀번호를 비교합니다.
 * @param {string} password 입력된 평문 비밀번호
 * @param {string} hashedPassword DB에 저장된 암호화된 비밀번호
 * @returns {Promise<boolean>} 일치 여부
 */
const comparePassword = async (password, hashedPassword) => {
    return await bcrypt.compare(password, hashedPassword);
};

module.exports = {
    hashPassword,
    comparePassword
};
