# Central

## 用途

1. RPC (服务端可远程调用浏览器内的函数)
2. 服务端消息推送
3. 云控 (服务端批量向浏览器/电脑/手机发出指令)

## 术语解释

1. Pod: 服务的运行容器, 可以是电脑/手机/浏览器
2. Server: Pod 的集约化管理服务器, 可以看作是 Pod 的网关
3. Client: 真正调用 Pod 服务的客户端

## 架构图

![架构图](https://github.com/SOVLOOKUP/central/assets/53158137/4b9ff7a8-83f4-4a90-9f6c-67946738197a)

## 函数约定

由 `__` 开始，由 `__` 结尾的函数为内置函数 例如：`__func_name__`

**server 内置函数:**

1. `__meta__`: 获取所有 pod 的可调用函数元信息
2. `__pods__`: 获取所有 pod 的 id

## 函数调用

client.call

    name: string
    input?: I,
    target?: string[]
    parser?: (msg: BCMsg) => Promise<T> | T
    msgId?: string
