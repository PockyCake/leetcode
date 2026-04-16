# JiuwenClaw Web 端 WebSocket 消息类型梳理

本文基于当前前端代码整理 `jiuwenclaw/web` 的 WebSocket 消息处理逻辑，重点关注：

- 消息类型
- 触发场景
- 前端如何发送和处理
- 主要处理文件
- 核心处理逻辑
- 数据结构

说明：

- 本文以当前工作区代码为准，核心入口是 `jiuwenclaw/web/src/services/webClient.ts`、`jiuwenclaw/web/src/hooks/useWebSocket.ts`、`jiuwenclaw/web/src/types/websocket.ts`
- 当前工作区没有 `.git` 历史元数据，因此无法精确追溯每种消息类型“从哪一天、哪个 commit 开始支持”
- 但可以从代码确认“当前版本是否支持”以及“是否存在旧协议兼容映射”

## 1. 协议层消息结构

WebSocket 协议层统一分为三类消息，定义见 `jiuwenclaw/web/src/types/websocket.ts`。

### 1.1 `req`

前端发给后端的请求。

```ts
interface WsRequest {
  type: 'req';
  id: string;
  method: string;
  params?: Record<string, unknown>;
}
```

典型场景：

- 发送聊天消息
- 中断、暂停、恢复
- 提交用户审批答案
- 其他 WebSocket RPC 风格调用

发送入口：

- `jiuwenclaw/web/src/services/webClient.ts`
- `jiuwenclaw/web/src/hooks/useWebSocket.ts`

### 1.2 `res`

后端对 `req` 的响应。

```ts
interface WsResponse {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: string;
  code?: string;
}
```

核心逻辑：

- `webClient.request()` 发送请求时先把 `id` 放入 `pending`
- 收到 `res` 后，`webClient.resolvePending()` 按 `id` 完成或拒绝 Promise

### 1.3 `event`

后端主动推送事件。

```ts
interface WsEvent {
  type: 'event';
  event: string;
  payload: Record<string, unknown>;
  seq?: number;
  stream_id?: string;
}
```

典型场景：

- 流式回复
- 工具调用进度
- 媒体内容
- 审批请求
- team 模式事件
- session 更新

## 2. 底层收发与兼容层

底层 WebSocket 收发由 `jiuwenclaw/web/src/services/webClient.ts` 负责。

主要职责：

- 建立连接、断线重连
- 统一发送 `req`
- 接收消息并做 JSON 解析
- 把旧协议字段名映射到新事件名
- 把 `res` 交给 pending request
- 把 `event` 分发给注册的处理器

### 2.1 旧协议兼容映射

当前代码里有一层旧事件名到新事件名的映射：

```ts
const LEGACY_EVENT_MAP = {
  connection_ack: 'connection.ack',
  content_chunk: 'chat.delta',
  content: 'chat.final',
  media_content: 'chat.media',
  tool_call: 'chat.tool_call',
  tool_result: 'chat.tool_result',
  error: 'chat.error',
  interrupt_result: 'chat.interrupt_result',
  subtask_update: 'chat.subtask_update',
  ask_user_question: 'chat.ask_user_question',
  todo_update: 'todo.updated',
  session_update: 'session.updated',
  processing_status: 'chat.processing_status',
  heartbeat: 'connection.heartbeat',
};
```

这说明至少以下类型已经经历过一次命名演进：

- `chat.media`
- `chat.ask_user_question`
- `session.updated`
- `chat.processing_status`
- 其他表中的兼容项

## 3. 当前前端支持的对话类消息总览

当前 `jiuwenclaw/web/src/hooks/useWebSocket.ts` 已注册的主要事件有：

- `connection.ack`
- `hello`
- `chat.delta`
- `chat.final`
- `chat.media`
- `chat.tool_call`
- `chat.tool_result`
- `todo.updated`
- `context.compressed`
- `heartbeat.relay`
- `session.updated`
- `chat.processing_status`
- `chat.error`
- `chat.interrupt_result`
- `chat.subtask_update`
- `chat.ask_user_question`
- `session_result`
- `chat.session_result`
- `team.event`
- `team.message`
- `team.task`
- `team.member`

前端主动发送的主要 `req.method` 有：

- `chat.send`
- `chat.interrupt`
- `chat.user_answer`
- `history.get`

## 4. 重点消息类型详解

下面重点整理用户最关心的消息类型。

---

## 4.1 `chat.media`

### 触发场景

当后端回复中包含媒体内容时触发，例如：

- 图片
- 音频
- 视频
- 文档

通常用于“文本 + 附件”混合输出，或模型结果中包含结构化媒体项。

### 数据结构

消息本体是 `event`：

```ts
{
  type: 'event',
  event: 'chat.media',
  payload: {
    content?: string;
    media_items?: MediaItem[];
  }
}
```

其中 `MediaItem` 定义在 `jiuwenclaw/web/src/types/message.ts`：

```ts
interface MediaItem {
  type: 'image' | 'audio' | 'video' | 'document';
  mimeType: string;
  filename: string;
  base64Data?: string;
  url?: string;
}
```

### 前端处理文件

- `jiuwenclaw/web/src/hooks/useWebSocket.ts`
- `jiuwenclaw/web/src/types/message.ts`
- `jiuwenclaw/web/src/components/ChatPanel/MessageItem.tsx`

### 前端处理逻辑

在 `useWebSocket.ts` 中：

- 先按 `session_id` 判断是否属于当前会话
- 取当前流式消息 `currentStreamId`
- 如果没有流式消息，就回退到最近一条 assistant 消息
- 把 `payload.content` 和 `payload.media_items` 更新到消息对象

在 `MessageItem.tsx` 中：

- 如果消息上有 `mediaItems`
- 就在文本下方通过 `MediaRenderer` 渲染媒体内容

### 更细的处理链路

入口位置：

- `jiuwenclaw/web/src/hooks/useWebSocket.ts:661`
- `jiuwenclaw/web/src/components/ChatPanel/MessageItem.tsx:435`

执行顺序：

1. `webClient.on('chat.media', ...)` 收到事件
2. `shouldHandleSessionEvent(payload)` 先判断这条消息是否属于当前会话
3. 读取 `useChatStore.getState()` 中的：
   - `currentStreamId`
   - `messages`
4. 目标消息选择规则：
   - 优先更新当前正在流式输出的 assistant 消息
   - 如果当前没有流式消息，则回退到最近一条 assistant 消息
5. 组装 `updates`
   - `payload.content` 存在时更新消息文本
   - `payload.media_items` 存在时更新 `mediaItems`
6. 调用 `updateMessage(targetId, updates)`
7. 如果 `payload.content` 有文本，还会调用 `handleTtsPlayback(targetId, mediaPayload.content)`

这意味着 `chat.media` 不一定单独创建一条新消息，更常见的是“补写”到已经存在的 assistant 消息上。

### 特殊分支与注意点

- 如果当前没有任何 assistant 消息，前端会直接返回，不做展示
- `chat.media` 的文本和媒体是绑在同一条消息上的，因此 UI 上会看到“文字正文 + 媒体块”组合
- 这类消息不经过 `addMessage()` 新增消息，而是以 `updateMessage()` 为主

### 前端是否发送

前端不会主动发送 `chat.media`，它只消费该事件。

---

## 4.2 `chat.ask_user_question`

### 触发场景

当 Agent 执行过程中需要用户确认时触发，例如：

- 自进化审批
- 工具权限确认
- 批量审批
- 需要用户选择下一步操作

### 数据结构

定义在 `jiuwenclaw/web/src/types/websocket.ts`：

```ts
interface AskUserQuestionPayload {
  request_id: string;
  questions: Question[];
  source?: string;
}

interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multi_select?: boolean;
}

interface QuestionOption {
  label: string;
  description?: string;
}
```

### 前端处理文件

- `jiuwenclaw/web/src/hooks/useWebSocket.ts`
- `jiuwenclaw/web/src/stores/chatStore.ts`
- `jiuwenclaw/web/src/components/ChatPanel/InlineQuestionCard.tsx`
- `jiuwenclaw/web/src/features/UserQuestionModal/index.tsx`

### 前端处理逻辑

在 `useWebSocket.ts` 中：

- 监听 `chat.ask_user_question`
- 调用 `setPendingQuestion(payload)`

在 `chatStore.ts` 中：

- 把这份审批数据存入 `pendingQuestion`

在 `InlineQuestionCard.tsx` 中：

- 读取 `pendingQuestion`
- 在聊天流里渲染交互式审批卡片
- 单问题模式通常选择后立即提交
- 多问题模式支持批量提交和“全部接受”

### 更细的处理链路

入口位置：

- `jiuwenclaw/web/src/hooks/useWebSocket.ts:819`
- `jiuwenclaw/web/src/stores/chatStore.ts:514`
- `jiuwenclaw/web/src/components/ChatPanel/InlineQuestionCard.tsx:24`

执行顺序：

1. `webClient.on('chat.ask_user_question', ...)` 收到事件
2. `shouldHandleSessionEvent(payload)` 过滤非当前会话事件
3. 调用 `setPendingQuestion(payload as AskUserQuestionPayload)`
4. `chatStore.pendingQuestion` 更新后，`InlineQuestionCard` 自动重新渲染
5. `InlineQuestionCard` 根据 `pendingQuestion.questions.length` 判断：
   - 单问题模式
   - 批量审批模式
6. 组件内部会维护本地状态：
   - `selections`
   - `submitted`
7. 提交后调用上层 `onSubmit(requestId, answers, source)`
8. 随后立即调用 `setPendingQuestion(null)` 清掉卡片

### 卡片内部行为细节

单问题模式：

- 用户点一个选项后，`handleSelect()` 会立刻触发 `doSubmit()`
- 不需要额外点击“提交”

批量模式：

- 每个问题先记录选择
- 支持“全部接受”
- 只有全部问题都已选择时才允许统一提交

特殊样式分支：

- 当 `request_id` 以 `skill_evolve_approve_` 开头时，卡片会按“自进化审批”样式高亮显示

### 特殊分支与注意点

- 当前实现把审批 UI 内联在聊天流里，而不是只依赖弹窗
- `pendingQuestion` 是单值，不是队列，所以前端一次只展示一组待确认问题

### 前端如何发送对应答案

用户提交答案后，前端会调用 `sendUserAnswer()`。

普通情况发送：

```ts
request('chat.user_answer', {
  session_id,
  request_id,
  answers,
})
```

特殊情况：

- 如果 `source === 'permission_interrupt'`
- 前端改走 `chat.send`
- 参数里附带 `request_id` 和 `answers`

这是一个兼容分支。

---

## 4.3 `chat.user_answer`

### 触发场景

这不是后端推送事件，而是前端对 `chat.ask_user_question` 的回应。

典型场景：

- 用户在审批卡片中点击“接受”
- 用户点击“拒绝”
- 用户完成多条审批并统一提交

### 数据结构

定义在 `jiuwenclaw/web/src/types/websocket.ts`：

```ts
interface UserAnswer {
  selected_options: string[];
  custom_input?: string;
}

interface UserAnswerPayload {
  request_id: string;
  answers: UserAnswer[];
}
```

实际发送时还会附带 `session_id`。

### 前端处理文件

- `jiuwenclaw/web/src/hooks/useWebSocket.ts`
- `jiuwenclaw/web/src/components/ChatPanel/InlineQuestionCard.tsx`
- `jiuwenclaw/web/src/App.tsx`

### 前端发送逻辑

1. `InlineQuestionCard` 收集选项
2. 调用上层 `onSubmit`
3. 上层调用 `sendUserAnswer(sessionId, requestId, answers, source)`
4. `useWebSocket.ts` 中通过 `request('chat.user_answer', ...)` 发给后端

### 更细的处理链路

入口位置：

- `jiuwenclaw/web/src/components/ChatPanel/InlineQuestionCard.tsx:54`
- `jiuwenclaw/web/src/App.tsx:763`
- `jiuwenclaw/web/src/hooks/useWebSocket.ts:413`

执行顺序：

1. `InlineQuestionCard.doSubmit()` 生成 `answers`
2. 调用 `onSubmit(pendingQuestion.request_id, answers, pendingQuestion.source)`
3. `App.tsx` 中的 `handleUserAnswer()` 接住这个调用
4. `handleUserAnswer()` 调用 `sendUserAnswer(sessionId, requestId, answers, source)`
5. `useWebSocket.ts` 中的 `sendUserAnswer()` 分两种情况发送：
   - 普通情况：`chat.user_answer`
   - 权限中断兼容分支：`chat.send`
6. 成功后执行 `setPendingQuestion(null)`
7. 失败时写入 `connectionStats.lastError` 并触发 `onError`

### 两条发送分支

普通审批分支：

```ts
await request('chat.user_answer', {
  session_id: sessionId,
  request_id: requestId,
  answers,
});
```

权限确认兼容分支：

```ts
await request('chat.send', {
  session_id: sessionId,
  query: '',
  request_id: requestId,
  answers,
});
```

触发条件：

- `source === 'permission_interrupt'`

这说明前端为了兼容一部分后端链路，没有把所有审批回答统一走 `chat.user_answer`。

### 前端是否接收同名事件

当前前端没有监听名为 `chat.user_answer` 的事件。

---

## 4.4 `chat.session_result`

### 触发场景

用于表示“一个会话级任务已经执行完成并产出结果”。

典型场景：

- 后端把某次 session 级执行结果单独作为事件回传
- 非普通聊天正文，而是更接近任务完成通知

### 数据结构

当前代码按如下字段读取：

```ts
payload = {
  session_id?: string;
  description?: string;
  result?: string;
}
```

### 前端处理文件

- `jiuwenclaw/web/src/hooks/useWebSocket.ts`
- `jiuwenclaw/web/src/stores/chatStore.ts`
- `jiuwenclaw/web/src/components/ChatPanel/ToolCallDisplay.tsx`

### 前端处理逻辑

在 `useWebSocket.ts` 中：

- 构造一个伪 `ToolCall`
- `name` 固定为 `session`
- `description` 来自 payload
- 再构造一个对应的 `ToolResult`
- 通过 `addToolCall()` 和 `addToolResult()` 存入聊天 store

最终展示效果：

- 在聊天流里以“工具调用/工具结果”的形式展示
- 而不是普通 assistant 文本气泡

### 更细的处理链路

入口位置：

- `jiuwenclaw/web/src/hooks/useWebSocket.ts:857`

执行顺序：

1. 收到 `chat.session_result`
2. 先做去重：`shouldDropDuplicatedEvent('chat.session_result', payload)`
3. 设置 `setThinking(false)`，结束思考态
4. 从 payload 读取：
   - `session_id`
   - `description`
   - `result`
5. 临时生成一个 `toolCallId`
6. 构造 `sessionToolCall`
   - `name: 'session'`
   - `arguments` 里带 `session_id` 和 `description`
   - `description` 作为展示标题
7. 调用 `addToolCall(sessionToolCall)`
8. 再拼接 `fullResult`
   - 如果有 `description`，格式是“描述 + 结果”
   - 否则只展示 `result`
9. 构造 `sessionResult`
10. 调用 `addToolResult(sessionResult)`

### 为什么按工具结果显示

因为这段逻辑没有 `addMessage(role: 'assistant')`，而是直接进入工具执行存储：

- `chatStore.addToolCall`
- `chatStore.addToolResult`

因此最终渲染走的是工具执行视图，而不是 Markdown 聊天气泡。

### 前端是否发送

前端不会主动发送 `chat.session_result`。

---

## 4.5 `session_result`

### 触发场景

这是 `chat.session_result` 的旧格式兼容事件。

### 数据结构

和 `chat.session_result` 当前处理方式一致：

```ts
payload = {
  session_id?: string;
  description?: string;
  result?: string;
}
```

### 前端处理文件

- `jiuwenclaw/web/src/hooks/useWebSocket.ts`

### 前端处理逻辑

- 与 `chat.session_result` 基本一致
- 也是转成 `session` 工具调用和工具结果

### 更细的处理链路

入口位置：

- `jiuwenclaw/web/src/hooks/useWebSocket.ts:824`

说明：

- 这条链路基本就是 `chat.session_result` 的旧格式兼容实现
- 两段代码几乎是重复的
- 当前前端没有把二者再统一抽象成一个公用函数

这意味着排查问题时，需要同时看：

- `session_result`
- `chat.session_result`

避免只改了一处导致新旧格式表现不一致。

### 兼容性说明

当前前端同时监听：

- `session_result`
- `chat.session_result`

说明新旧格式并存。

---

## 4.6 `session.updated`

### 触发场景

会话元信息发生变化时触发，例如：

- 模式切换
- 标题更新
- 状态变更
- `updated_at` 变化
- 后端同步会话统计信息

### 数据结构

当前代码将它视为 `Partial<Session>`，其中 `Session` 定义在 `jiuwenclaw/web/src/types/index.ts`：

```ts
interface Session {
  session_id: string;
  title: string;
  project_path: string;
  mode: AgentMode;
  status: SessionStatus;
  message_count: number;
  created_at: string;
  updated_at: string;
  is_active?: boolean;
  is_processing?: boolean;
  current_task?: string;
  tools?: string[];
  channel_id?: string;
  user_id?: string;
  last_message_at?: number;
}
```

### 前端处理文件

- `jiuwenclaw/web/src/hooks/useWebSocket.ts`
- `jiuwenclaw/web/src/stores/sessionStore.ts`
- 会话列表相关组件

### 前端处理逻辑

在 `useWebSocket.ts` 中：

- 从 payload 取 `session_id`
- 调用 `updateSession(sessionId, payload)`
- 如果当前激活会话的 `mode` 有变化
- 额外调用 `setMode()`，同步前端模式状态

在 `sessionStore.ts` 中：

- 更新 `sessions`
- 如当前会话匹配，也同步更新 `currentSession`
- 会对 `mode` 做归一化，只允许 `plan`、`agent`、`agentteam`

### 更细的处理链路

入口位置：

- `jiuwenclaw/web/src/hooks/useWebSocket.ts:741`
- `jiuwenclaw/web/src/stores/sessionStore.ts:193`

执行顺序：

1. 收到 `session.updated`
2. 读取 `payload.session_id`
3. 如果没有 `session_id`，直接忽略
4. 调用 `updateSession(sessionId, payload as Partial<Session>)`
5. `sessionStore.updateSession()` 内部会：
   - 遍历 `sessions`
   - 找到对应 `session_id`
   - 合并更新字段
   - 如果 `currentSession.session_id` 也匹配，则同步更新 `currentSession`
6. 如果该事件对应当前激活会话，且 `payload.mode` 是字符串：
   - `useWebSocket.ts` 会额外调用 `setMode(normalizeAgentMode(payload.mode))`

### 关键设计点

- `updateSession()` 不只是更新列表，也会更新当前会话对象
- `mode` 会被归一化，避免后端传入大小写或未知值造成前端状态污染
- 这类消息不直接写聊天消息，而是更新 session 侧 store

### 前端是否发送

前端不会主动发送 `session.updated`。

---

## 4.7 `team.event`

### 触发场景

主要用于 `agentteam` 模式下的团队事件和消息传播，例如：

- 成员之间广播
- 成员点对点消息
- team leader 给用户的消息

### 数据结构

当前代码兼容两种形态：

```ts
payload = {
  event?: {
    type?: string;
    from_member?: string;
    to_member?: string;
    content?: string;
    timestamp?: number;
  };
  payload?: {
    event?: {
      type?: string;
      from_member?: string;
      to_member?: string;
      content?: string;
      timestamp?: number;
    };
  };
}
```

### 前端处理文件

- `jiuwenclaw/web/src/hooks/useWebSocket.ts`
- `jiuwenclaw/web/src/components/ChatPanel/MessageItem.tsx`

### 前端处理逻辑

在 `useWebSocket.ts` 中：

- 收到后先做去重
- 然后插入一条 `role: 'system'` 的聊天消息
- 内容格式为 `team.event:${JSON.stringify(payload)}`

在 `MessageItem.tsx` 中：

- 如果系统消息前缀是 `team.event:`
- 就解析里面的 JSON
- 根据 `event.type` 判断是普通 team leader 消息、P2P 消息、broadcast 消息
- 渲染成团队消息卡片

### 更细的处理链路

入口位置：

- `jiuwenclaw/web/src/hooks/useWebSocket.ts:893`
- `jiuwenclaw/web/src/components/ChatPanel/MessageItem.tsx:214`

执行顺序：

1. 收到 `team.event`
2. 先调用 `shouldDropDuplicatedEvent('team.event', payload)` 去重
3. 调用 `setThinking(false)` 停止思考动画
4. 使用 `addMessage(...)` 插入一条系统消息：

```ts
{
  id: `team-event-${Date.now()}`,
  role: 'system',
  content: `team.event:${JSON.stringify(payload)}`,
  timestamp: new Date().toISOString(),
}
```

5. 这条消息进入普通消息列表
6. 渲染到 `MessageItem` 时，命中 `content.startsWith('team.event:')` 分支
7. 组件继续解析 `payload.event || payload.payload?.event`
8. 再根据事件类型决定展示形式

### 展示分支

普通 team leader 消息：

- `from_member === 'team_leader'`
- 且不是 P2P，也不是 broadcast
- 渲染为更接近“系统代表发言”的卡片

P2P 消息：

- `type` 以 `.p2p` 结尾
- 会显示 `@to_member`

broadcast 消息：

- `type` 以 `.broadcast` 结尾
- 会显示“@所有人”样式标签

### 关键设计点

- `team.event` 先被编码为普通系统消息，再由 `MessageItem` 做二次解释
- 也就是说它不是专用消息结构，而是“借系统消息壳子承载 team 事件”

### 前端是否发送

当前前端不主动发送 `team.event`。

---

## 4.8 `team.message`

### 触发场景

用于 team 模式下的团队消息。

从当前实现看，它和 `team.event` 的展示路径几乎一致。

### 数据结构

当前前端按普通 team payload 处理，没有单独定义更严格的类型。

### 前端处理文件

- `jiuwenclaw/web/src/hooks/useWebSocket.ts`
- `jiuwenclaw/web/src/components/ChatPanel/MessageItem.tsx`

### 前端处理逻辑

在 `useWebSocket.ts` 中：

- 收到 `team.message`
- 也会被转换成 `role: 'system'` 消息
- 内容仍然是 `team.event:${JSON.stringify(payload)}`

因此在展示层：

- 最终仍然走 `MessageItem.tsx` 的 `team.event:` 解析逻辑

### 更细的处理链路

入口位置：

- `jiuwenclaw/web/src/hooks/useWebSocket.ts:905`

执行顺序：

1. 收到 `team.message`
2. 走去重逻辑
3. `setThinking(false)`
4. 插入一条系统消息
5. 注意：当前实现里消息前缀仍然写的是 `team.event:`

```ts
content: `team.event:${JSON.stringify(payload)}`
```

所以从渲染视角看：

- `team.message` 并没有单独的展示组件分支
- 它最终和 `team.event` 共用一套消息卡片逻辑

### 关键设计点

- 这说明当前前端把 team 文本类事件统一收口到了 `MessageItem.tsx` 的 `team.event:` 分支
- 如果后续要区分 `team.message` 和 `team.event` 的 UI，需要先改这里的编码方式

### 备注

就当前代码而言：

- `team.message` 和 `team.event` 在前端展示上基本合流
- 二者的差异更多可能在后端语义层

---

## 4.9 `team.task`

### 触发场景

用于 team 模式下的任务事件，例如：

- 子任务开始
- 子任务状态变化
- 子任务完成

### 数据结构

当前前端按如下结构读取：

```ts
payload = {
  event?: {
    type?: string;
    team_id?: string;
    task_id?: string;
    status?: string;
    timestamp?: number;
  };
  payload?: {
    event?: {
      type?: string;
      team_id?: string;
      task_id?: string;
      status?: string;
      timestamp?: number;
    };
  };
}
```

内部写入 store 的结构：

```ts
interface TeamTaskEvent {
  id: string;
  type: string;
  team_id: string;
  task_id: string;
  status: string;
  timestamp: number;
}
```

### 前端处理文件

- `jiuwenclaw/web/src/hooks/useWebSocket.ts`
- `jiuwenclaw/web/src/stores/sessionStore.ts`
- `jiuwenclaw/web/src/components/ToolPanel/index.tsx`
- `jiuwenclaw/web/src/components/TeamTaskEvents.tsx`

### 前端处理逻辑

在 `useWebSocket.ts` 中：

- 提取 `payload.event` 或 `payload.payload.event`
- 组装为 `TeamTaskEvent`
- 调用 `useSessionStore.getState().addTeamTaskEvent(...)`

在 `sessionStore.ts` 中：

- 如果已有相同 `task_id`
- 则更新已有记录
- 否则插入一条新事件

在 UI 中：

- `agentteam` 模式下右侧工具面板不再显示 TodoList
- 改为显示 `TeamTaskEvents`
- 作为“任务事件日志”

### 更细的处理链路

入口位置：

- `jiuwenclaw/web/src/hooks/useWebSocket.ts:917`
- `jiuwenclaw/web/src/stores/sessionStore.ts:336`
- `jiuwenclaw/web/src/components/ToolPanel/index.tsx:126`
- `jiuwenclaw/web/src/components/TeamTaskEvents.tsx:20`

执行顺序：

1. 收到 `team.task`
2. 走去重逻辑
3. `setThinking(false)`
4. 从 payload 里提取 `event`
5. 如果没有 `event`，直接返回
6. 组装 store 内部结构：
   - `id`
   - `type`
   - `team_id`
   - `task_id`
   - `status`
   - `timestamp`
7. 调用 `useSessionStore.getState().addTeamTaskEvent(...)`
8. `sessionStore.addTeamTaskEvent()` 内部按 `task_id` 去重/覆盖
9. `ToolPanel` 在 `mode === 'agentteam'` 时展示 `TeamTaskEvents`
10. `TeamTaskEvents` 组件再把 `type` 解析成更短的事件名展示

### 关键设计点

- `team.task` 不进入聊天消息流
- 它进入的是右侧状态区数据流
- 因为 store 会按 `task_id` 覆盖，所以右侧面板更接近“任务最新状态列表”，不是完整不可变日志

---

## 4.10 `team.member`

### 触发场景

用于 team 模式下成员状态同步，例如：

- 成员加入
- 成员状态变化
- 成员任务状态更新

### 数据结构

当前前端读取的事件结构：

```ts
payload = {
  event?: {
    type?: string;
    member_id?: string;
    status?: string;
    new_status?: string;
    timestamp?: number;
  };
  payload?: {
    event?: {
      type?: string;
      member_id?: string;
      status?: string;
      new_status?: string;
      timestamp?: number;
    };
  };
}
```

内部 store 结构：

```ts
interface TeamMember {
  id: string;
  member_id: string;
  status: string;
  timestamp: number;
}
```

### 前端处理文件

- `jiuwenclaw/web/src/hooks/useWebSocket.ts`
- `jiuwenclaw/web/src/stores/sessionStore.ts`
- `jiuwenclaw/web/src/components/ToolPanel/index.tsx`
- `jiuwenclaw/web/src/components/TeamArea.tsx`

### 前端处理逻辑

在 `useWebSocket.ts` 中：

- 取出 `event`
- 如果 `type === 'team.member.status_changed'`
- 调用 `updateTeamMemberStatus(member_id, new_status, timestamp)`
- 否则调用 `addTeamMember(...)`

在 `sessionStore.ts` 中：

- 若成员已存在，则覆盖更新
- 若不存在，则新增

在 UI 中：

- `agentteam` 模式下右侧工具面板会显示团队成员区
- 成员数据来自 `teamMembers`

### 更细的处理链路

入口位置：

- `jiuwenclaw/web/src/hooks/useWebSocket.ts:936`
- `jiuwenclaw/web/src/stores/sessionStore.ts:355`
- `jiuwenclaw/web/src/stores/sessionStore.ts:371`
- `jiuwenclaw/web/src/components/ToolPanel/index.tsx:142`

执行顺序：

1. 收到 `team.member`
2. 走去重逻辑
3. `setThinking(false)`
4. 提取 `event`
5. 如果没有 `event`，直接返回
6. 判断是否为 `team.member.status_changed`
7. 分两条路径：
   - 状态变化：调用 `updateTeamMemberStatus(member_id, new_status, timestamp)`
   - 普通成员事件：调用 `addTeamMember(...)`

`sessionStore.addTeamMember()`：

- 按 `member_id` 查重
- 已存在则覆盖
- 不存在则新增

`sessionStore.updateTeamMemberStatus()`：

- 只更新已存在成员的 `status` 和 `timestamp`
- 如果成员不存在，则直接忽略

### 关键设计点

- `team.member.status_changed` 必须依赖成员已存在
- 如果后端先发状态变化、后发成员注册事件，前端第一次状态变化会被忽略
- 这属于当前实现的一个顺序依赖

---

## 5. 相关的其他对话消息

虽然本文重点是上面几类，但对完整理解很重要的消息还有：

### 5.1 `chat.delta`

场景：

- 流式输出文本增量

处理逻辑：

- 普通模式下追加到当前 assistant 流式消息
- `agentteam` 模式下累积到 team leader 消息

### 5.2 `chat.final`

场景：

- 一次回复的最终结果

处理逻辑：

- 结束流式状态
- 更新最终文本
- 可能触发 TTS

### 5.3 `chat.tool_call`

场景：

- 模型开始调用工具

处理逻辑：

- 写入工具执行 store
- 展示工具调用卡片

### 5.4 `chat.tool_result`

场景：

- 工具执行完成

处理逻辑：

- 更新工具结果
- 改变工具执行状态

### 5.5 `chat.processing_status`

场景：

- 后端通知当前 session 是否仍在处理中

处理逻辑：

- 更新 `isProcessing`
- 处理结束时清理子任务进度

### 5.6 `chat.subtask_update`

场景：

- agent 拆分出的子任务进度更新

处理逻辑：

- 写入 `activeSubtasks`
- 在聊天区消息列表下方显示“并行任务执行中”

### 5.7 `chat.interrupt_result`

场景：

- 暂停、取消、恢复、补充输入后的结果回执

处理逻辑：

- 更新暂停态、处理中状态和提示文案

### 5.8 `history.message`

场景：

- 前端发起 `history.get` 后，后端通过 `history.message` 按帧回放历史消息
- 用于会话恢复
- 用于聊天顶部“加载更多历史”

处理文件：

- `jiuwenclaw/web/src/features/historyRestore.ts`
- `jiuwenclaw/web/src/App.tsx`

处理逻辑：

- `historyRestore.ts` 监听 `history.message`
- 只处理当前 `session_id` 对应的历史流，避免串台
- 兼容 `payload.status: done`、`payload.content: done`、`page_complete`、`is_last` 等结束标记
- 从历史记录里只恢复前端关心的内容：
  - 用户消息
  - `chat.final`
  - `chat.tool_call`
  - `chat.tool_result`
- 最终整理为：
  - `messages`
  - `toolReplay`
  - `totalPages`

相关常量：

```ts
export const HISTORY_GET_METHOD = 'history.get';
export const HISTORY_MESSAGE_EVENT = 'history.message';
```

说明：

- `history.message` 不是普通实时聊天消息
- 它是历史回放专用事件
- 当前业务分发入口不在 `useWebSocket.ts`，而在 `features/historyRestore.ts`

### 更细的处理链路

入口位置：

- `jiuwenclaw/web/src/features/historyRestore.ts`
- `jiuwenclaw/web/src/App.tsx:634`
- `jiuwenclaw/web/src/App.tsx:838`

全量恢复场景：

1. `App.tsx` 在进入已有 session 时调用 `beginHistoryRestore(...)`
2. `beginHistoryRestore()` 内部订阅 `webClient.on('history.message', ...)`
3. 订阅建立后，`App.tsx` 再发送：

```ts
request('history.get', {
  session_id: sessionId,
  page_idx: 1,
});
```

4. 后端连续回放 `history.message`
5. 每一帧会先经过：
   - `shouldProcessHistoryPayload(payload, expectedSessionId)`
   - 防止不同 session 的历史串台
6. 然后更新 `totalPages`
7. 再判断是否结束：
   - `payload.status === 'done'`
   - `payload.content === 'done'`
   - `page_complete`
   - `is_last`
   - `done`
   - `last`
8. 如果不是结束帧，则解析 `payload.message` 或 `payload.content`
9. 最终只接受这些历史记录类型：
   - 用户消息
   - `chat.final`
   - `chat.tool_call`
   - `chat.tool_result`
10. 最后将结果分成两路：
   - `messages`
   - `toolReplay`

分页加载场景：

1. 用户在聊天顶部点击或滚动触发 `handleLoadMoreHistory()`
2. `App.tsx` 调用 `fetchHistoryPage(...)`
3. 订阅建立后再发：

```ts
request('history.get', {
  session_id: sid,
  page_idx: nextPage,
});
```

4. 历史帧被解析后：
   - `prependMessages(messages)` 追加到聊天顶部
   - `toolReplay` 重新喂给 `addToolCall/addToolResult`
   - 更新 `historyPagerMeta`

### 为什么不在 `useWebSocket.ts` 处理

因为历史恢复不是普通实时事件流，它有这些额外需求：

- 和实时消息隔离
- 需要分页
- 需要“只恢复部分 event_type”
- 需要处理结束帧和空页
- 需要防串台和互斥

所以单独抽到了 `features/historyRestore.ts`。

## 6. 前端主动发送的主要请求

当前对话链路里，前端主要会主动发送这些 `req.method`。

### 6.1 `chat.send`

触发场景：

- 用户发送聊天消息
- 特殊的权限确认答案回传

发送文件：

- `jiuwenclaw/web/src/hooks/useWebSocket.ts`

请求结构：

```ts
request('chat.send', {
  session_id,
  content,
  mode,
})
```

权限确认兼容分支会发送：

```ts
request('chat.send', {
  session_id,
  query: '',
  request_id,
  answers,
})
```

### 6.2 `chat.interrupt`

触发场景：

- pause
- cancel
- supplement
- resume

请求结构：

```ts
request('chat.interrupt', {
  session_id,
  intent,
  new_input?,
})
```

### 6.3 `chat.user_answer`

触发场景：

- 回答 `chat.ask_user_question`

请求结构：

```ts
request('chat.user_answer', {
  session_id,
  request_id,
  answers,
})
```

### 6.4 `history.get`

触发场景：

- 进入已有会话时自动恢复历史
- 用户在聊天顶部点击或上滑“加载更多历史”

发送文件：

- `jiuwenclaw/web/src/App.tsx`
- `jiuwenclaw/web/src/features/historyRestore.ts`

请求结构：

```ts
request('history.get', {
  session_id,
  page_idx,
})
```

其中：

- `session_id` 表示要恢复哪一个会话
- `page_idx` 表示要拉取第几页历史，首页通常是 `1`

前端处理逻辑：

1. 在 `App.tsx` 中先建立历史恢复订阅：
   - 全量恢复用 `beginHistoryRestore(...)`
   - 分页加载用 `fetchHistoryPage(...)`
2. 再发送 `history.get`
3. 后端随后通过 `history.message` 连续推送历史记录帧
4. `historyRestore.ts` 把这些历史帧转成前端消息和工具回放
5. `App.tsx` 再把结果写回：
   - `messages`
   - `toolReplay`
   - `historyPagerMeta`

### 更细的处理链路

入口位置：

- `jiuwenclaw/web/src/App.tsx:634`
- `jiuwenclaw/web/src/App.tsx:838`
- `jiuwenclaw/web/src/features/historyRestore.ts`

首次进入会话时：

1. `App.tsx` 检测到当前 `sessionId` 是已有会话
2. 调用 `beginHistoryRestore(...)`
3. 再发送 `request(HISTORY_GET_METHOD, { session_id, page_idx: 1 })`
4. `onReady` 时：
   - `clearMessages()`
   - 插入恢复后的消息
   - 回放工具调用结果
   - 设置 `historyPagerMeta`
5. `onEmpty` 时：
   - 仍更新分页信息
   - 特殊情况下显示“空历史”提示

向上加载更多时：

1. `handleLoadMoreHistory()` 计算 `nextPage`
2. 调用 `fetchHistoryPage(...)`
3. 发送 `request(HISTORY_GET_METHOD, { session_id, page_idx: nextPage })`
4. `onReady` 时：
   - `prependMessages(messages)`
   - 回放该页工具调用/结果
   - 更新 `loadedPages`
5. `onEmpty` 时：
   - 只更新分页信息，不加消息

### 关键设计点

- 历史恢复和分页拉取是互斥的，`historyRestore.ts` 里专门维护了 active handle，避免两路 `history.get` 并发导致重复消息
- 代码注释已经明确：不能在多个地方同时 `beginHistoryRestore + history.get`，否则会产生双份历史消息

配套数据结构：

```ts
interface FetchHistoryPageResult {
  messages: Message[];
  toolReplay: HistoryToolReplayItem[];
  totalPages: number | null;
}

interface HistoryToolReplayItem {
  kind: 'tool_call' | 'tool_result';
  at: string;
  payload: Record<string, unknown>;
}
```

后端侧可确认：

- `history.get` 已在 `jiuwenclaw/app_web_handlers.py` 注册
- 后端会透传 `page_idx`
- 前端代码已约定后续返回 `history.message` 事件流

## 7. 关键状态存储

### 7.1 `chatStore`

文件：

- `jiuwenclaw/web/src/stores/chatStore.ts`

与本文相关的重要状态：

- `messages`
- `pendingQuestion`
- `activeSubtasks`
- `toolExecutions`
- `currentStreamId`
- `currentStreamContent`

### 7.2 `sessionStore`

文件：

- `jiuwenclaw/web/src/stores/sessionStore.ts`

与本文相关的重要状态：

- `sessions`
- `currentSession`
- `mode`
- `teamTaskEvents`
- `teamMembers`

## 8. 主要处理文件速查

### 协议与底层

- `jiuwenclaw/web/src/types/websocket.ts`
- `jiuwenclaw/web/src/types/message.ts`
- `jiuwenclaw/web/src/services/webClient.ts`

### 业务事件总入口

- `jiuwenclaw/web/src/hooks/useWebSocket.ts`

### 聊天区展示

- `jiuwenclaw/web/src/components/ChatPanel/index.tsx`
- `jiuwenclaw/web/src/components/ChatPanel/MessageItem.tsx`
- `jiuwenclaw/web/src/components/ChatPanel/InlineQuestionCard.tsx`
- `jiuwenclaw/web/src/components/ChatPanel/SubtaskProgress.tsx`

### 右侧状态区与 team 展示

- `jiuwenclaw/web/src/components/ToolPanel/index.tsx`
- `jiuwenclaw/web/src/components/TeamTaskEvents.tsx`
- `jiuwenclaw/web/src/components/TeamArea.tsx`

### 状态存储

- `jiuwenclaw/web/src/stores/chatStore.ts`
- `jiuwenclaw/web/src/stores/sessionStore.ts`

## 9. 总结

从当前前端实现看，WebSocket 对话链路可以概括为：

1. 前端通过 `req/res` 方式发起 RPC 风格请求
2. 后端通过 `event` 持续推送对话流、工具进度、审批请求、session 更新和 team 事件
3. `useWebSocket.ts` 是业务分发中心
4. `chatStore` 负责聊天态数据
5. `sessionStore` 负责会话和 team 态数据
6. 最终由聊天区和右侧工具区分别展示

重点消息里：

- `chat.media` 负责补充媒体内容
- `chat.ask_user_question` 和 `chat.user_answer` 组成审批往返链路
- `chat.session_result` / `session_result` 负责会话级任务结果
- `session.updated` 负责同步会话元信息
- `team.event` / `team.message` 负责团队消息展示
- `team.task` / `team.member` 负责 team 模式下右侧状态区的数据更新
