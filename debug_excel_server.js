const { generateExcelBuffer } = require('./utils/excelGenerator');
try {
  const products = [
    {
      mall_name: "네이버",
      product_name: "한국제지 밀크 A4 복사용지 75g 2500매, 1개",
      price: 11200,
      tax: 1120,
      total_price: 12320,
      shipping_days: 2,
      product_url: "https://search.shopping.naver.com/catalog/51929474192"
    }
  ];
  generateExcelBuffer(products);
  console.log("Success");
} catch(e) {
  console.error("Error:", e);
}
