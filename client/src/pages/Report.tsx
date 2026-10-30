import { Placeholder } from '../components/Placeholder'

export function Report() {
  return (
    <Placeholder
      icon="chart"
      title="年度报告"
      subtitle="把这一年的日子，折成一页可以慢慢看的总结。"
      points={[
        '这一年在一起多少天、新增多少张照片',
        '哪个月最热闹、去过哪些地方',
        '最常出现的表情、最常一起做的事',
        '年度最佳照片墙，可以一首一首往下翻',
        '文字和数字都会从真实记录里算出来，不是模板'
      ]}
      phase="第三期"
    />
  )
}
