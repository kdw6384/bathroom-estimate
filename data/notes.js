// 견적서 하단에 항상 들어가는 고정 문구 (실제 견적서 3건에서 공통으로 확인됨)
// 계약금 비율/부가세 방식은 화면에서 설정한 값을 그대로 반영해야 하므로 함수로 만듦
module.exports = function getNotes(depositRatePercent, vatMode) {
  const vatLine =
    vatMode === "inclusive"
      ? "상기 금액은 부가세가 포함된 금액입니다."
      : "상기 금액은 부가세 별도입니다.";
  return [
    vatLine,
    `계약금 ${depositRatePercent}%, 공사완료 후 나머지 잔금 입금.`,
    "하자 보수기간은 공사종료 후 시점부터 1년간 보장함.",
    "견적금액은 현장작업 상황에 따라 변동될 수 있습니다.",
  ];
};
