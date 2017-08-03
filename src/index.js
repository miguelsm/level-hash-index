import { NotFoundError } from 'level-errors'
import strHash from './utils/string-hash'

export default function HashIndex (db, options = {}) {
  const hashFn = options.hashFn || strHash
  const indexPrefix = options.indexPrefix || 'hash!'

  const runtimeCacheCollisions = {}

  function nextHashForThisValHash (valHash) {
    let nextHashSeq = -1
    let hash
    let hashSeq
    for (const val in runtimeCacheCollisions[valHash]) {
      if (runtimeCacheCollisions[valHash].hasOwnProperty(val)) {
        hash = runtimeCacheCollisions[valHash][val].hash
        hashSeq = parseInt(hash.substring(valHash.length), 36)
        if (hashSeq > nextHashSeq) {
          nextHashSeq = hashSeq
        }
      }
    }
    const n = nextHashSeq + 1
    return valHash + n.toString(36)
  }

  function checkIsInCache (valHash, val) {
    return runtimeCacheCollisions[valHash].hasOwnProperty(val)
  }

  async function loadFromCache (valHash, val) {
    try {
      var o = runtimeCacheCollisions[valHash][val]
      return o.isNew
        ? await new Promise((resolve, reject) => {
            // let's see if it still 'isNew'
            db.get(o.key, err => {
              if (err) {
                if (err.notFound) {
                  resolve(o) // must still be new
                } else {
                  reject(err)
                }
                return
              }
              runtimeCacheCollisions[valHash][val] = { hash: o.hash } //no longer new
              resolve(runtimeCacheCollisions[valHash][val])
            })
          })
        : o
    } catch (e) {
      throw e
    }
  }

  async function put (val) {
    try {
      const valHash = hashFn(val)
      if (runtimeCacheCollisions.hasOwnProperty(valHash)) {
        if (checkIsInCache(valHash, val)) {
          return await loadFromCache(valHash, val)
        }
      } else {
        runtimeCacheCollisions[valHash] = {}
      }
      let theHash = null
      return await new Promise((resolve, reject) => {
        db
          .createReadStream({
            keys: true,
            values: true,
            gte: indexPrefix + valHash + '\x00',
            lte: indexPrefix + valHash + '\xFF'
          })
          .on('data', data => {
            const hash = data.key.substring(indexPrefix.length)
            runtimeCacheCollisions[valHash][data.value] = { hash }
            if (data.value === val) {
              theHash = hash
            }
          })
          .on('error', err => {
            reject(err)
          })
          .on('end', async () => {
            try {
              // by the time this ends, some one else may have hashed the same value, so let's check the cache
              if (checkIsInCache(valHash, val)) {
                resolve(await loadFromCache(valHash, val))
                return
              }
              if (theHash !== null) {
                resolve({ hash: theHash })
              } else {
                const hash = nextHashForThisValHash(valHash)
                runtimeCacheCollisions[valHash][val] = {
                  hash,
                  isNew: true,
                  key: indexPrefix + hash
                }
                resolve(runtimeCacheCollisions[valHash][val])
              }
            } catch (e) {
              reject(e)
            }
          })
      })
    } catch (e) {
      throw e
    }
  }

  return {
    put,
    async getHash (val) {
      try {
        const d = await put(val)
        if (d.isNew) {
          throw new NotFoundError('No hash exists for that value')
        } else {
          return d.hash
        }
      } catch (e) {
        throw e
      }
    },
    async putAndWrite (val) {
      try {
        const d = await put(val)
        if (d.isNew) {
          return new Promise((resolve, reject) => {
            db.put(indexPrefix + d.hash, val, err => {
              if (err) {
                reject(err)
              } else {
                resolve(d.hash)
              }
            })
          })
        } else {
          return d.hash
        }
      } catch (e) {
        throw e
      }
    },
    get (key) {
      return new Promise((resolve, reject) => {
        db.get(indexPrefix + key, (err, val) => {
          if (err) {
            reject(err)
          } else {
            resolve(val)
          }
        })
      })
    }
  }
}
