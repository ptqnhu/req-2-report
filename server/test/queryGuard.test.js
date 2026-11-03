import { test } from "node:test";
import assert from "node:assert/strict";
import { checkReadOnly } from "../src/services/queryGuard.js";
import { firstTableName } from "../src/services/sqlParser.js";

test("allows SELECT and CTEs", () => {
  assert.equal(checkReadOnly("SELECT a FROM t"), "");
  assert.equal(checkReadOnly(";WITH x AS (SELECT 1 AS a) SELECT a FROM x;"), "");
  assert.equal(checkReadOnly("select last_update, [delete] from t where note = 'drop table x'"), "");
});

test("blocks writes, multiple statements and procedures", () => {
  assert.match(checkReadOnly("DELETE FROM t"), /Only SELECT/);
  assert.match(checkReadOnly("SELECT 1; DROP TABLE t"), /single SELECT/);
  assert.match(checkReadOnly("SELECT * INTO backup_t FROM t"), /INTO/);
  assert.match(checkReadOnly("WITH x AS (SELECT 1 a) SELECT * FROM x WHERE 1 = (SELECT 1 FROM OPENROWSET('a','b','c'))"), /OPENROWSET/);
  assert.match(checkReadOnly("SELECT * FROM t /* ok */ EXEC xp_cmdshell 'dir'"), /EXEC/);
});

test("a comment marker inside a string doesn't hide what follows", () => {
  assert.notEqual(checkReadOnly("SELECT '--'; COMMIT; UPDATE dbo.Loans SET Balance=0"), "");
  assert.notEqual(checkReadOnly("SELECT '/*' a; DROP TABLE dbo.Loans; SELECT '*/'"), "");
  assert.equal(checkReadOnly("SELECT '-- not a comment' AS a, '/* nor this */' AS b -- note: it's fine"), "");
});

test("blocks statements that need no semicolon", () => {
  assert.match(checkReadOnly("SELECT 1 COMMIT DISABLE TRIGGER trg ON dbo.Loans"), /COMMIT/);
  assert.match(checkReadOnly("SELECT 1 BEGIN TRAN"), /BEGIN/);
  assert.match(checkReadOnly("SELECT NEXT VALUE FOR dbo.Seq"), /NEXT VALUE FOR/);
  assert.equal(checkReadOnly("SELECT begin_dtm, [commit] FROM t"), "");
});

test("finds the main table for a default title", () => {
  assert.equal(firstTableName("SELECT a FROM dbo.[Orders] o JOIN x ON 1=1"), "Orders");
  assert.equal(firstTableName("WITH c AS (SELECT * FROM inner_t) SELECT * FROM c"), "c");
});
