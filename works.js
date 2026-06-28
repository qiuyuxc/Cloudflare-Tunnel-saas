export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    try {
      const payload = await request.json();
      
      if (!payload || !payload.message) {
        return new Response("OK", { status: 200 });
      }

      const chatId = payload.message.chat ? payload.message.chat.id : null;
      if (!chatId) return new Response("OK", { status: 200 });

      // 优先抓取发件人ID
      const userId = payload.message.from ? payload.message.from.id : chatId;

      // 管理员身份校验
      const adminIds = (env.ADMIN_TG_ID || "").split(",").map(id => id.trim());
      if (!adminIds.includes(userId.toString())) {
        await sendTelegram(chatId, `⛔ **拒绝访问**\n身份校验失败：您的 TG ID [${userId}] 未授权。`, env);
        return new Response("OK", { status: 200 });
      }

      if (!payload.message.text) {
        return new Response("OK", { status: 200 });
      }

      const text = payload.message.text.trim();
      const args = text.split(/\s+/);
      const command = args[0];

      switch (command) {
        case "/start":
        case "/help":
          await handleHelp(chatId, env);
          break;

        case "/当前配置":
          await handleCurrentConfig(chatId, env);
          break;

        case "/列出隧道":
          await handleListTunnels(chatId, env);
          break;

        case "/选择隧道":
          if (args.length < 2) {
            await sendTelegram(chatId, "❌ 请输入隧道ID。例如: `/选择隧道 8db7f365-xxx`", env);
          } else {
            await env.SAAS_KV.put(`user_tunnel_${chatId}`, args[1]);
            await sendTelegram(chatId, `✅ 已锁定隧道ID: \`${args[1]}\`\n\n💡 **下一步**：请设置本地转发端口。\n例如: \`/转发 http://localhost:3000\``, env);
          }
          break;

        case "/转发":
          if (args.length < 2) {
            await sendTelegram(chatId, "❌ 请输入完整的本地服务URL。例如: `/转发 http://localhost:3000`", env);
          } else {
            await env.SAAS_KV.put(`user_service_${chatId}`, args[1]);
            await sendTelegram(chatId, `✅ 转发源站已锁定: \`${args[1]}\`\n\n💡 **最后一步**：请指定绑定的域名。\n顺序为：[对外访问域名] [用作回源的辅助域名]\n例如：\`/绑定域名 kukie.cn fallback.169977.xyz\``, env);
          }
          break;

        case "/绑定域名":
          if (args.length < 3) {
            await sendTelegram(chatId, "❌ 参数不足。请按顺序输入: `/绑定域名 [访问域名] [辅助域名]`", env);
          } else {
            await handleDomainBinding(chatId, args[1], args[2], env);
          }
          break;

        case "/全局优选":
          if (args.length < 2) {
            await sendTelegram(chatId, "❌ 请指定你的自定义优选 CNAME。例如: `/全局优选 cdn.kukie.cn`", env);
          } else {
            await env.SAAS_KV.put(`global_pref_cname`, args[1]);
            await sendTelegram(chatId, `🎯 全局自选优选 CNAME 已成功变更为: \`${args[1]}\``, env);
          }
          break;

        case "/设置回退源":
          if (args.length < 2) {
            await sendTelegram(chatId, "❌ 请指定回退源域名。例如: `/设置回退源 fallback.169977.xyz`", env);
          } else {
            await handleSetFallback(chatId, args[1], env);
          }
          break;

        default:
          break;
      }

      return new Response("OK", { status: 200 });
    } catch (err) {
      return new Response(err.message, { status: 500 });
    }
  }
};

// ==================== 核心命令逻辑 ====================

async function handleHelp(chatId, env) {
  const msg1 = [
    "🤖 SaaS 模块化管理助手",
    "",
    "📖 基础配置指令",
    "• /全局优选 [域名]",
    "• /设置回退源 [辅助域名]",
    "",
    "⚙️ 隧道与转发指令",
    "• /列出隧道",
    "• /选择隧道 [隧道ID]",
    "• /转发 [本地地址]"
  ].join("\n");

  const msg2 = [
    "🎉 终极组合指令",
    "• /绑定域名 [主域名] [辅助域名]",
    "",
    "🔍 状态查询",
    "• /当前配置",
    "",
    "💡 提示：每条命令会自动读取该 ID 的上下文。"
  ].join("\n");

  await sendTelegram(chatId, msg1, env);
  await sendTelegram(chatId, msg2, env);
}

async function handleCurrentConfig(chatId, env) {
  const tunnelId = await env.SAAS_KV.get(`user_tunnel_${chatId}`);
  const serviceUrl = await env.SAAS_KV.get(`user_service_${chatId}`);
  const globalPref = await env.SAAS_KV.get(`global_pref_cname`) || "cf.090227.xyz";

  let configText = `⚙️ **当前会话配置状态**\n\n`;
  configText += `🤖 **锁定隧道 ID**: \n${tunnelId ? `\`${tunnelId}\`` : "❌ 未锁定"}\n\n`;
  configText += `🔌 **本地转发地址**: \n${serviceUrl ? `\`${serviceUrl}\`` : "❌ 未锁定"}\n\n`;
  configText += `🎯 **全局优选 CNAME**: \n\`${globalPref}\`\n\n`;
  configText += `--- \n💡 **下一步操作引导**：\n`;

  if (!tunnelId) {
    configText += "👉 您尚未锁定隧道。请执行 `/列出隧道` 复制ID，然后使用 `/选择隧道 [隧道ID]` 进行锁定。";
  } else if (!serviceUrl) {
    configText += "👉 隧道已锁定，但缺少转发地址。请使用 `/转发 [本地服务地址]` 设置目标。";
  } else {
    configText += "✅ 基础参数均已就绪！\n👉 您现在可以直接执行终极指令：\n`/绑定域名 [访问域名] [辅助域名]`";
  }

  await sendTelegram(chatId, configText, env);
}

async function handleListTunnels(chatId, env) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/cfd_tunnel?is_deleted=false`;
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${env.CF_API_TOKEN}`,
      "Content-Type": "application/json"
    }
  });

  const data = await response.json();
  if (!data.success) {
    await sendTelegram(chatId, `❌ 获取隧道列表失败: ${JSON.stringify(data.errors)}`, env);
    return;
  }

  let text = "📋 **您账户下的 Tunnel 隧道列表：**\n\n";
  data.result.forEach(t => {
    text += `🔹 **名称**: ${t.name}\n\`${t.id}\`\n状态: ${t.status}\n\n`;
  });
  text += "👉 请使用 \`/选择隧道 [隧道ID]\` 来指定你要配置哪一台机器。";
  await sendTelegram(chatId, text, env);
}

async function handleSetFallback(chatId, fallbackDomain, env) {
  const zoneId = await getZoneIdByHostname(fallbackDomain, env);
  if (!zoneId) {
    await sendTelegram(chatId, `❌ 未能匹配到 \`${fallbackDomain}\` 所在的 Zone ID，请确认域名已托管。`, env);
    return;
  }

  const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/custom_hostnames/fallback_origin`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${env.CF_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ origin: fallbackDomain })
  });

  const data = await response.json();
  if (data.success) {
    await sendTelegram(chatId, `✅ 成功将 \`${fallbackDomain}\` 设置为回退源！`, env);
  } else {
    await sendTelegram(chatId, `❌ 设置回退源失败: ${data.errors[0].message}`, env);
  }
}

async function handleDomainBinding(chatId, mainDomain, auxDomain, env) {
  const tunnelId = await env.SAAS_KV.get(`user_tunnel_${chatId}`);
  const serviceUrl = await env.SAAS_KV.get(`user_service_${chatId}`);
  const globalPref = await env.SAAS_KV.get(`global_pref_cname`) || "cf.090227.xyz";

  if (!tunnelId || !serviceUrl) {
    await sendTelegram(chatId, "⚠️ 缺少上下文状态！请先执行 `/选择隧道` 和 `/转发`。", env);
    return;
  }

  await sendTelegram(chatId, "⏳ 正在拉取隧道配置并全自动下发核心路由，请稍候...", env);

  const mainZoneId = await getZoneIdByHostname(mainDomain, env);
  const auxZoneId = await getZoneIdByHostname(auxDomain, env);

  if (!mainZoneId || !auxZoneId) {
    await sendTelegram(chatId, "❌ 未能匹配主域名或辅助域名的 Zone ID，配置终止。", env);
    return;
  }

  // 写入 Tunnel 路由规则
  const configUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/cfd_tunnel/${tunnelId}/configurations`;
  const configRes = await fetch(configUrl, { headers: { "Authorization": `Bearer ${env.CF_API_TOKEN}` } });
  const configData = await configRes.json();

  if (configData.success) {
    let currentConfig = configData.result.config || { ingress: [] };
    const newRules = [
      { hostname: mainDomain, service: serviceUrl },
      { hostname: auxDomain, service: serviceUrl }
    ];
    
    if (currentConfig.ingress && currentConfig.ingress.length > 0) {
      const len = currentConfig.ingress.length;
      currentConfig.ingress = [
        ...currentConfig.ingress.slice(0, len - 1),
        ...newRules,
        currentConfig.ingress[len - 1]
      ];
    } else {
      currentConfig.ingress = [...newRules, { service: "http_status:404" }];
    }

    await fetch(configUrl, {
      method: "PUT",
      headers: { "Authorization": `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ config: currentConfig })
    });
  }

  // 下发 DNS 解析
  const tunnelCNAME = `${tunnelId}.cfargotunnel.com`;
  await upsertDNSRecord(auxZoneId, auxDomain, "CNAME", tunnelCNAME, true, env);
  await upsertDNSRecord(mainZoneId, mainDomain, "CNAME", globalPref, false, env);

  // 绑定 SaaS 主机名
  const saasUrl = `https://api.cloudflare.com/client/v4/zones/${auxZoneId}/custom_hostnames`;
  const saasRes = await fetch(saasUrl, {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      hostname: mainDomain,
      custom_origin_server: auxDomain,
      ssl: { method: "http", type: "dv" }
    })
  });
  const saasData = await saasRes.json();

  if (saasData.success) {
    await sendTelegram(chatId, `🎉 **全套模块化路由配置成功！**\n\n🌐 **访问入口**: \`${mainDomain}\`\n↩️ **内部回源**: \`${auxDomain}\`\n🚀 **优选指向**: \`${globalPref}\`\n\n🔒 请等待 1-2 分钟后直接尝试 HTTPS 访问！`, env);
  } else {
    await sendTelegram(chatId, `❌ SaaS 绑定失败: ${saasData.errors[0].message}`, env);
  }
}

// ==================== 辅助工具函数 ====================

async function getZoneIdByHostname(hostname, env) {
  hostname = hostname.trim().toLowerCase().replace(/\.$/, "");
  const response = await fetch("https://api.cloudflare.com/client/v4/zones?status=active&per_page=1000", {
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" }
  });
  const data = await response.json();
  if (!data.success) return null;

  const zones = data.result || [];
  let bestMatch = null;

  for (const zone of zones) {
    const zoneName = zone.name.trim().toLowerCase();
    if (hostname === zoneName || hostname.endsWith("." + zoneName)) {
      if (!bestMatch || zoneName.length > bestMatch.name.length) {
        bestMatch = zone;
      }
    }
  }
  return bestMatch ? bestMatch.id : null;
}

async function upsertDNSRecord(zoneId, name, type, content, proxied, env) {
  const listUrl = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${name}&type=${type}`;
  const listRes = await fetch(listUrl, { headers: { "Authorization": `Bearer ${env.CF_API_TOKEN}` } });
  const listData = await listRes.json();

  const payload = { name, type, content, proxied, ttl: 1 };
  if (listData.success && listData.result.length > 0) {
    const recordId = listData.result[0].id;
    const updateUrl = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`;
    await fetch(updateUrl, {
      method: "PUT",
      headers: { "Authorization": `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } else {
    const createUrl = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`;
    await fetch(createUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  }
}

async function sendTelegram(chatId, text, env) {
  const url = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" })
  });
}

