function hashCode (str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (31 * hash + str.charCodeAt(i)) | 0
  }
  return ((hash >>> 1) & 0x40000000) | (hash & 0xbfffffff)
}

export default function (str) {
  return hashCode(str).toString(36)
}
