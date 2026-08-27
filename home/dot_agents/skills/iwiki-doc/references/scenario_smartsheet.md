# 场景：多维表格操作

## 核心命令（`iwiki-cli smartsheet`）

### 1. `field-list` - 获取字段结构
**何时使用：**
- 在操作表格前了解字段结构
- 确认字段名称和类型
```bash
iwiki-cli smartsheet field-list 123456
iwiki-cli smartsheet field-list 123456 --view-id view123
```

### 2. `view-list` - 获取视图列表
**何时使用：**
- 查看表格有哪些视图（表格/看板/甘特图等）
- 获取特定视图 ID
```bash
iwiki-cli smartsheet view-list 123456
iwiki-cli smartsheet view-list 123456 --view-type Kanban
```

### 3. `record-list` - 查询记录
**何时使用：**
- 查询表格数据 / 筛选符合条件的记录 / 获取特定字段的数据
```bash
# 不传 --query 时走默认分页（pageNum=1, pageSize=20）
iwiki-cli smartsheet record-list 123456

iwiki-cli smartsheet record-list 123456 --query '{
  "pageNum": 1,
  "pageSize": 50,
  "filterByFormula": "{状态}='"'"'进行中'"'"'",
  "fields": "标题,负责人,优先级",
  "sort": "优先级 DESC",
  "viewId": "view123"
}'
```
`--query` 支持字段：`pageNum`/`pageSize`/`viewId`/`maxRecords`/`sort`/`recordIds`/`fields`/`filterByFormula`/`cellFormat`/`fieldKey`，均可省略。

### 4. `record-add` - 批量添加记录
**何时使用：**
- 向表格添加新记录 / 批量导入数据
```bash
iwiki-cli smartsheet record-add 123456 --data '{
  "fieldKey": "name",
  "records": [
    {"fields": {"标题": "需求分析", "负责人": "张三", "状态": "待处理", "优先级": "高"}}
  ]
}'
# --data-file ./records.json 亦可（与 --data 互斥）
```

### 5. `record-update` - 批量更新记录
**何时使用：**
- 修改已有记录的字段值 / 批量更新状态
```bash
iwiki-cli smartsheet record-update 123456 --data '{
  "fieldKey": "name",
  "records": [
    {"recordId": "rec123", "fields": {"状态": "已完成"}}
  ]
}'
```
> `records` 中每项必须包含非空 `recordId`（CLI 会本地校验）。

### 6. `record-delete` - 批量删除记录
**⚠️ 高危操作：数据删除后不可恢复**
**何时使用：**
- 删除不需要的记录
- **必须用户明确确认后才能执行**
```bash
iwiki-cli smartsheet record-delete 123456 rec123 rec456
```

### 7. `field-add` - 添加字段
**何时使用：**
- 为表格添加新列 / 扩展表格数据结构
```bash
iwiki-cli smartsheet field-add 123456 --data '{
  "name": "优先级",
  "type": "SingleSelect",
  "property": {
    "options": [
      {"name": "高", "color": "red"},
      {"name": "中", "color": "yellow"},
      {"name": "低", "color": "green"}
    ]
  }
}'
```
> `--data` 必须包含非空的 `name` 和 `type`，`property` 可选。CLI 对 `property` 有自动处理：
> - `Text` 类型：传入的 `property` 会被自动移除（不需要）
> - `SingleText` 类型：未传 `property` 时自动补 `{"defaultValue":""}`
> - 其他类型：`property` 为空对象时自动省略

## 支持的字段类型

| 分类 | 字段类型 | 描述 | 可写入 |
|------|----------|------|--------|
| **文本类** | `SingleText` | 单行文本 | ✅ |
| | `Text` | 多行文本 | ✅ |
| **选择类** | `SingleSelect` | 单选 | ✅ |
| | `MultiSelect` | 多选 | ✅ |
| **数值类** | `Number` / `Currency` / `Percent` / `Rating` | 数字/货币/百分比/评分 | ✅ |
| **日期** | `DateTime` | 日期时间 | ✅ |
| | `CreatedTime` / `LastModifiedTime` | 创建/修改时间（自动） | ❌ |
| **人员** | `Member` | 成员 | ✅ |
| | `CreatedBy` / `LastModifiedBy` | 创建/修改人（自动） | ❌ |
| **关联** | `OneWayLink` / `TwoWayLink` | 单向/双向关联 | ✅ |
| **其他** | `Attachment` / `Checkbox` / `URL` / `Phone` / `Email` | 附件/复选框/链接/电话/邮箱 | ✅ |
| | `WorkDoc` / `MagicLookUp` / `Button` | 工作文档/神奇引用/按钮 | ✅ |
| | `Formula` / `AutoNumber` | 公式/自动编号（自动计算） | ❌ |

### 8. `field-delete` - 删除字段
**⚠️ 高危操作：字段及其所有数据删除后不可恢复**
**何时使用：**
- 删除不需要的字段
- **必须用户明确确认后才能执行**
```bash
iwiki-cli smartsheet field-delete 123456 fld123
```

## 实践示例

### 示例 1：查询并分析表格数据
**用户需求：** "查看项目管理表格中所有进行中的任务"
**执行步骤：**
1. **先获取字段结构**
```bash
iwiki-cli smartsheet field-list 123456
```
2. **查询符合条件的记录**
```bash
iwiki-cli smartsheet record-list 123456 --query '{
  "pageNum": 1,
  "pageSize": 50,
  "filterByFormula": "{状态}='"'"'进行中'"'"'",
  "fields": "标题,负责人,优先级,截止日期",
  "sort": "优先级 DESC"
}'
```

### 示例 2：批量添加任务
**用户需求：** "在任务表格中添加本周的新任务"
**执行步骤：**
1. **确认字段结构**（确保字段名正确）
```bash
iwiki-cli smartsheet field-list 123456
```
2. **批量添加记录**
```bash
iwiki-cli smartsheet record-add 123456 --data '{
  "fieldKey": "name",
  "records": [
    {"fields": {"标题": "需求分析", "负责人": "张三", "状态": "待处理", "优先级": "高", "截止日期": "2026-04-20"}},
    {"fields": {"标题": "技术方案设计", "负责人": "李四", "状态": "待处理", "优先级": "中", "截止日期": "2026-04-22"}}
  ]
}'
```

### 示例 3：更新任务状态
**用户需求：** "将张三负责的所有任务标记为已完成"
**执行步骤：**
1. **查询需要更新的记录**
```bash
iwiki-cli smartsheet record-list 123456 --query '{"filterByFormula": "{负责人}='"'"'张三'"'"'"}'
```
2. **根据返回的 recordId 批量更新**
```bash
iwiki-cli smartsheet record-update 123456 --data '{
  "fieldKey": "name",
  "records": [
    {"recordId": "rec123", "fields": {"状态": "已完成"}},
    {"recordId": "rec456", "fields": {"状态": "已完成"}}
  ]
}'
```

### 示例 4：为表格添加新字段
**用户需求：** "在任务表格中添加一个'优先级'单选字段"
**执行步骤：**
```bash
iwiki-cli smartsheet field-add 123456 --data '{
  "name": "优先级",
  "type": "SingleSelect",
  "property": {
    "options": [
      {"name": "高", "color": "red"},
      {"name": "中", "color": "yellow"},
      {"name": "低", "color": "green"}
    ]
  }
}'
```

### 示例 5：删除过期记录
**用户需求：** "删除已归档的旧任务"
**执行步骤：**
1. **查询要删除的记录**
```bash
iwiki-cli smartsheet record-list 123456 --query '{"filterByFormula": "{状态}='"'"'已归档'"'"'"}'
```
2. **向用户确认删除操作**
```
⚠️ 即将删除 5 条记录，删除后不可恢复，是否确认？
```
3. **用户确认后执行删除**
```bash
iwiki-cli smartsheet record-delete 123456 rec123 rec456 rec789
```



## 支持的视图类型

| 视图类型 | 英文标识 | 适用场景 |
|----------|----------|----------|
| 表格 | `Grid` | 数据查看、编辑 |
| 画廊 | `Gallery` | 图片展示、产品目录 |
| 看板 | `Kanban` | 任务管理、项目进度 |
| 甘特图 | `Gantt` | 项目规划、进度追踪 |
| 日历 | `Calendar` | 日程安排、事件管理 |
| 架构 | `Architecture` | 层级结构展示 |

## 筛选条件语法

支持的筛选表达式：
```
{字段名}='值'              # 等于
{字段名}!='值'             # 不等于
{字段名}>'100'            # 大于（数值）
{字段名}<'100'            # 小于（数值）
AND({条件1}, {条件2})      # 与
OR({条件1}, {条件2})       # 或
```

**示例：**
```bash
# 高优先级且未完成的任务
filterByFormula="AND({优先级}='高', {状态}!='已完成')"

# 本周截止的任务
filterByFormula="{截止日期}>'2026-04-14'"
```

## 重要注意事项

### ⚠️ 高危操作
- **`field-delete`** 和 **`record-delete`** 删除后数据不可恢复
- 执行前必须向用户说明影响范围
- 必须获得用户明确确认后才能执行

### 📎 附件字段
- **附件字段格式**：附件字段的值是数组类型，每个附件是一个包含 `token`、`name`、`size`、`width`、`height`、`mimeType` 的对象
- **追加附件**：如需追加附件而非替换，先用 `record-list` 获取现有附件数组，将新附件添加到数组末尾后更新

### 💡 最佳实践
1. **操作前先验证**：使用 `field-list` 确认字段名和类型
2. **fieldKey 推荐用 `name`**：更直观，只有字段名重复时才用 `id`
3. **分页规范**：单次最多 200 条，大数据量必须分页处理
4. **自动字段不可写**：`Formula`、`AutoNumber`、`CreatedTime`、`LastModifiedTime`、`CreatedBy`、`LastModifiedBy` 等字段只能查询，添加/更新记录时不要包含这些字段
5. **小批量测试**：批量操作前先用少量数据测试，确认无误后再批量执行
6. **JSON 入参用 `--data-file`/`--query-file`**：内容较长或含特殊字符时，优先写入临时文件再用 `--data-file`/`--query-file` 传入，避免 shell 转义问题

---
