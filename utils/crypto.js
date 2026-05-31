// server/utils/crypto.js
// 개인정보 암호화를 위한 유틸리티 함수 모듈

const crypto = require('crypto');
// ---------------------------------------------------------
// [경고] 
// 실제 운영(Production) 환경에서는 ENCRYPTION_KEY 값을 
// .env 파일(환경변수)에 저장하여 절대로 코드에 노출되지 않게 해야 합니다.
// 현재는 개발 및 테스트를 위해 하드코딩된 더미 키를 사용합니다.
// 키 길이는 AES-256 알고리즘을 위해 반드시 32바이트(256비트)여야 합니다.
// ---------------------------------------------------------
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012'; // 32 chars
const IV_LENGTH = 16; // AES 알고리즘의 IV(초기화 벡터) 길이는 16바이트입니다.

/**
 * 평문 텍스트를 AES-256-CBC 알고리즘으로 암호화합니다.
 * @param {string} text 암호화할 평문 (예: 홍길동)
 * @returns {string} iv와 암호화된 데이터가 결합된 16진수 문자열
 */
function encrypt(text) {
    if (!text) return text;
    
    // 16바이트의 랜덤한 초기화 벡터(IV) 생성
    let iv = crypto.randomBytes(IV_LENGTH);
    
    // Cipher 객체 생성 (알고리즘, 키, iv 설정)
    let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    
    // 데이터 암호화
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    // 결과 반환 형식: iv값:암호화된값 (나중에 복호화 시 iv값이 필요하므로 함께 저장)
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

/**
 * 암호화된 텍스트를 원래의 평문으로 복호화합니다.
 * @param {string} text 암호화된 문자열 (iv:암호화된데이터 형식)
 * @returns {string} 복호화된 평문
 */
function decrypt(text) {
    if (!text) return text;
    
    // 저장된 문자열에서 iv값과 암호화된 데이터를 분리
    let textParts = text.split(':');
    let iv = Buffer.from(textParts.shift(), 'hex');
    let encryptedText = Buffer.from(textParts.join(':'), 'hex');
    
    // Decipher 객체 생성
    let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    
    // 데이터 복호화
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    // 복호화된 문자열 반환
    return decrypted.toString();
}

// 외부 파일에서 이 함수들을 사용할 수 있도록 내보냅니다.
module.exports = {
    encrypt,
    decrypt
};
