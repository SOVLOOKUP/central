import { z } from 'zod';
import { nanoid } from 'nanoid';
import { io } from 'socket.io-client';
import { Multicast, Channel } from 'queueable';
import { filter, take } from 'streaming-iterables';

// utils.ts
var baseType = z.object({
  // 数据包 ID
  id: z.string().length(21)
});
var callType = baseType.extend({
  type: z.enum(["call"]),
  data: z.object({
    func: z.string(),
    input: z.any()
  })
});
var returnType = baseType.extend({
  type: z.enum(["return"]),
  data: z.object(
    {
      func: z.string(),
      status: z.enum(["success"]),
      output: z.any()
    }
  ).or(z.object(
    {
      func: z.string(),
      status: z.enum(["error"]),
      error: z.object({
        name: z.string(),
        message: z.string().optional(),
        stack: z.string().optional()
      })
    }
  ))
});
var allType = z.union([callType, returnType]);

// utils.ts
var parseZodFunc = (zodFunc) => new (Object.getPrototypeOf(async function() {
})).constructor("z", `return await (${zodFunc})(z)`)(z);
var parseZodObjectFunc = async (obj) => {
  const nobj = {};
  for (const [key, value] of Object.entries(obj)) {
    nobj[key] = await parseZodFunc(value);
  }
  return nobj;
};
var newSend = (socket, timeout = 3e3) => socket["sendMsg"] = (data) => new Promise(async (ok, rj) => {
  try {
    socket.timeout(timeout).emit("msg", await allType.parseAsync(data));
    ok();
  } catch (error) {
    rj(error);
  }
});
var newHook = (u) => u;
function Connect({ uri, token: token2 }) {
  const msgChannel = new Multicast();
  const socket = io(uri, { auth: { type: "client", token: token2 } });
  const send = newSend(socket);
  const getHooks = async (msg_id = nanoid()) => {
    const subscription = filter((v) => v.id === msg_id, msgChannel[Symbol.asyncIterator]());
    await send({
      id: msg_id,
      type: "call",
      data: { func: "__meta__" }
    });
    const first = await subscription.next();
    const len = first.value.data.output.sockets.length;
    return {
      clients: first.value.data.output.sockets,
      hooks: {
        [Symbol.asyncIterator]: async function* () {
          yield {
            ...first.value.data.output.hook.data.output,
            hooks: await parseZodObjectFunc(first.value.data.output.hook.data.output.hooks)
          };
          for await (const hook of take(len - 1, subscription)) {
            yield {
              ...hook.data.output.hook.data.output,
              hooks: await parseZodObjectFunc(hook.data.output.hook.data.output.hooks)
            };
          }
        }
      }
    };
  };
  socket.on("msg", async (data) => msgChannel.push(await allType.parseAsync(data)));
  return { getHooks };
}
function Connect2(uri, hooks = {}) {
  const socket = io(uri, { auth: { type: "pod", token: "" } });
  socket.compress(true);
  const msgChannel = new Channel();
  const meta = new Map(Object.entries(hooks));
  const send = newSend(socket);
  meta.set("__meta__", newHook({
    io: (z5) => {
      return {
        input: z5.void(),
        output: z5.object({
          id: z5.string(),
          hooks: z5.record(z5.string(), z5.string())
        })
      };
    },
    func: (_) => {
      const output = {
        id: socket["id"],
        hooks: {}
      };
      for (const [key, value] of meta) {
        if (!(key.endsWith("__") && key.startsWith("__"))) {
          output.hooks[key] = value.io.toString();
        }
      }
      return output;
    }
  }));
  socket.on("msg", async (data) => {
    const msg = await allType.parseAsync(data);
    if (msg.type === "call") {
      const hook = meta.get(msg.data.func);
      if (hook) {
        const { input, output } = hook.io(z);
        const parsedInput = await input.safeParseAsync(msg.data.input);
        if (parsedInput.success) {
          try {
            const data2 = await hook.func(parsedInput.data);
            const outdata = await output.safeParseAsync(data2);
            if (outdata.success) {
              await send({
                id: msg.id,
                type: "return",
                data: {
                  func: msg.data.func,
                  status: "success",
                  output: outdata.data
                }
              });
            } else {
              console.log("\u8F93\u51FA\u6821\u9A8C\u5931\u8D25");
            }
          } catch (error) {
            console.log("\u51FD\u6570\u8FD0\u884C\u9519\u8BEF");
          }
        } else {
          console.log("\u8F93\u5165\u6821\u9A8C\u5931\u8D25");
        }
      } else {
        console.log("\u672A\u627E\u5230 called func");
      }
    } else if (msg.type === "return") {
      await msgChannel.push(msg);
    }
  });
  return msgChannel.wrap();
}
var token = ["token"];
var AuthMsg = z.object({
  type: z.enum(["client", "pod"]),
  token: z.string()
});
var tokenManager_default = () => {
  return {
    valid: async (msg) => {
      const data = await AuthMsg.safeParseAsync(msg);
      if (data.success) {
        switch (data.data.type) {
          case "client":
            return token.includes(data.data.token) ? "client" : false;
          case "pod":
            return "pod";
        }
      } else
        return false;
    }
  };
};

// server/index.ts
function serve(wss) {
  wss.compress(true);
  const msgChannel = new Multicast();
  const tm = tokenManager_default();
  const getHooks = async (msg_id = nanoid()) => {
    const sockets = [];
    for (const socket of await wss.fetchSockets()) {
      if (socket["type"] === "pod") {
        sockets.push(socket.id);
        const send = newSend(socket);
        await send({
          id: msg_id,
          type: "call",
          data: { func: "__meta__" }
        });
      }
    }
    return { sockets, hooksIter: take(sockets.length, filter((v) => v.id === msg_id, msgChannel[Symbol.asyncIterator]())) };
  };
  const porcessClientMsg = async (msg, send) => {
    if (msg.type === "call") {
      if (msg.data.func === "__meta__") {
        const { sockets, hooksIter } = await getHooks(msg.id);
        for await (const hook of hooksIter) {
          await send({
            id: msg.id,
            type: "return",
            data: {
              status: "success",
              func: msg.data.func,
              output: { sockets, hook }
            }
          });
        }
      }
    }
  };
  wss.use(async (socket, next) => {
    const res = await tm.valid(socket.handshake.auth);
    if (res === false) {
      next(new Error("not authorized"));
    } else {
      socket["type"] = res;
      console.log(socket.id, res, "\u5DF2\u8FDE\u63A5");
      next();
    }
  });
  wss.on("connection", async (socket) => {
    const send = newSend(socket);
    socket.on("disconnect", (reason) => console.log(socket["id"], (socket["type"] === "client" ? "\u5BA2\u6237\u7AEF" : "Pod") + "\u5DF2\u5173\u95ED:", reason));
    socket.use(async ([event, data], next) => {
      if (event === "msg") {
        const result = await allType.safeParseAsync(data);
        if (result.success === true) {
          const msg = result.data;
          switch (socket["type"]) {
            case "client":
              await porcessClientMsg(msg, send);
              break;
            case "pod":
              msgChannel.push(msg);
              break;
            default:
              console.log("\u672A\u77E5 socket \u7C7B\u578B:", socket["type"]);
              socket.disconnect();
          }
        } else {
          next(result.error);
        }
      }
    });
  });
}

export { Connect as client, newHook, Connect2 as pod, serve as server };
//# sourceMappingURL=out.js.map
//# sourceMappingURL=index.js.map