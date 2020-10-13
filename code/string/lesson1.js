// export default (str) => {
//   // 字符串按照空格进行分割，保存数组，数组的元素的先后顺序就是单词的顺序
//   let arr = str.split(' ')
//   // 对数组进行遍历，然后每个元素进行反转
//   let result = arr.map(item => {
//     return item.split('').reverse().join('')
//   })
//   return result.join(' ')
// }

// export default (str) => {
//   return str.split(' ').map(item => {
//     return item.split('').reverse().join('')
//   }).join(' ')
// }

// export default (str) => {
//   return str.split(/\s/g).map(item => {
//     return item.split('').reverse().join('')
//   }).join(' ')
// }

export default (str) => {
  return str.match(/\s/g).map(item => {
    return item.split('').reverse().join('')
  }).join(' ')
}
