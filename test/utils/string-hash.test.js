import _ from 'lodash'
import test from 'tape'
import strHash from '../../src/utils/string-hash'
import genRandomString from '../../src/utils/gen-random-string'

test('assert all string-hashes are the same length and alpha-numeric', t => {
  const hashes = _.map(_.range(0, 10000), () => strHash(genRandomString()))
  t.ok(_.every(hashes, RegExp.prototype.test, /^[-+]?[0-9a-z]+$/))
  t.end()
})
