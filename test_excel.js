const { generateSettlementExcel } = require('./utils/excelGenerator');
const fs = require('fs');

const mockOrders = [
    {
        order_date: '2026-05-18T00:00:00.000Z',
        mall_name: '쿠팡',
        product_name: '밀크 A4 복사용지 80g',
        price: 20000,
        tax: 2000,
        shipping_fee: 0,
        total_price: 22000,
        revenue: 30000,
        shipping_days: 1
    },
    {
        order_date: '2026-05-17T00:00:00.000Z',
        mall_name: '나비엠알오',
        product_name: '페이지 A4 복사용지 75g',
        price: 15000,
        tax: 1500,
        shipping_fee: 3000,
        total_price: 19500,
        revenue: 25000,
        shipping_days: 3
    }
];

const mockBusinessInfo = {
    name: '올빌드 주식회사',
    number: '123-45-67890'
};

const mockSearchResults = [
    {
        keyword: 'A4용지',
        items: [
            {
                mall_name: '쿠팡',
                product_name: '밀크 A4 복사용지 80g (1박스)',
                price: 20000,
                tax: 2000,
                shipping_fee: 0,
                total_price: 22000,
                shipping_days: 1,
                product_url: 'https://coupang.com/example'
            },
            {
                mall_name: '나비엠알오',
                product_name: '페이지 A4 복사용지 75g (1박스)',
                price: 15000,
                tax: 1500,
                shipping_fee: 3000,
                total_price: 19500,
                shipping_days: 3,
                product_url: 'https://navimro.com/example'
            }
        ]
    }
];

try {
    console.log('Generating settlement excel...');
    const buffer = generateSettlementExcel(mockOrders, mockBusinessInfo, mockSearchResults);
    fs.writeFileSync('test_settlement.xlsx', buffer);
    console.log('Successfully generated test_settlement.xlsx!');
} catch (e) {
    console.error('Error generating excel:', e);
}
