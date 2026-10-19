-- Prints a database's structure in the format of server/schemas/<database>.txt: tables, views, columns and foreign keys.
-- Structure only; it reads no row data. Run it against the database on a computer that can reach it, then save the output
-- as server/schemas/<database>.txt (needs SQL Server 2017 or later for STRING_AGG). For example:
--   sqlcmd -S <server> -d APN -E -C -i server/scripts/schema.sql -y 0 -f 65001 -o server/schemas/APN.txt
-- In SSMS, use Results to Grid and copy the column: Results to Text cuts long lines.
SET NOCOUNT ON;

WITH objs AS (
  SELECT s.name + '.' + o.name AS name, o.type, o.object_id
  FROM sys.objects o
  JOIN sys.schemas s ON s.schema_id = o.schema_id
  WHERE o.type IN ('U', 'V') AND o.is_ms_shipped = 0
), lines AS (
  SELECT 0 AS part, o.name AS sortKey,
         o.name + CASE o.type WHEN 'V' THEN ' (view): ' ELSE ' (table): ' END
         + STRING_AGG(CAST(c.name + ' ' + TYPE_NAME(c.user_type_id) AS nvarchar(max)), ', ') WITHIN GROUP (ORDER BY c.column_id) AS line
  FROM objs o
  JOIN sys.columns c ON c.object_id = o.object_id
  GROUP BY o.name, o.type
  UNION ALL
  SELECT k.part, '', k.line FROM (VALUES (1, ''), (2, 'Foreign keys:')) k(part, line)
  WHERE EXISTS (SELECT 1 FROM sys.foreign_key_columns)
  UNION ALL
  SELECT 3, f.fromTable + ' ' + f.toTable, f.fromTable + '.' + f.fromCol + ' -> ' + f.toTable + '.' + f.toCol
  FROM (
    SELECT OBJECT_SCHEMA_NAME(k.parent_object_id) + '.' + OBJECT_NAME(k.parent_object_id) AS fromTable, pc.name AS fromCol,
           OBJECT_SCHEMA_NAME(k.referenced_object_id) + '.' + OBJECT_NAME(k.referenced_object_id) AS toTable, rc.name AS toCol
    FROM sys.foreign_key_columns k
    JOIN sys.columns pc ON pc.object_id = k.parent_object_id AND pc.column_id = k.parent_column_id
    JOIN sys.columns rc ON rc.object_id = k.referenced_object_id AND rc.column_id = k.referenced_column_id
  ) f
)
SELECT line FROM lines ORDER BY part, sortKey;
