import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const ACCESS_TOKEN =
  process.env.META_MARKETING_ACCESS_TOKEN ||
  process.env.META_ACCESS_TOKEN ||
  "";

const RAW_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID || "";

const args = process.argv.slice(2);

function getArg(name, fallback = "") {
  const index = args.indexOf(`--${name}`);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  return fallback;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

const today = new Date();
const thirtyDaysAgo = new Date(today);
thirtyDaysAgo.setDate(today.getDate() - 30);

const SINCE = getArg("since", formatDate(thirtyDaysAgo));
const UNTIL = getArg("until", formatDate(today));
const LIMIT = Number(getArg("limit", "100"));

if (!ACCESS_TOKEN) {
  console.error("Erro: informe META_MARKETING_ACCESS_TOKEN no .env ou na variável de ambiente.");
  process.exit(1);
}

const AD_ACCOUNT_ID = RAW_AD_ACCOUNT_ID
  ? RAW_AD_ACCOUNT_ID.startsWith("act_")
    ? RAW_AD_ACCOUNT_ID
    : `act_${RAW_AD_ACCOUNT_ID}`
  : "";

const outputDir = path.resolve("tmp", "meta-ads-debug");
fs.mkdirSync(outputDir, { recursive: true });

async function graphRequest(pathOrUrl, params = {}) {
  const isFullUrl = pathOrUrl.startsWith("http");

  const url = isFullUrl
    ? new URL(pathOrUrl)
    : new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${pathOrUrl.replace(/^\//, "")}`);

  if (!isFullUrl) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value));
      }
    }

    url.searchParams.set("access_token", ACCESS_TOKEN);
  }

  const response = await fetch(url.toString());
  const json = await response.json();

  if (!response.ok || json.error) {
    const message = json?.error?.message || response.statusText;
    const code = json?.error?.code || response.status;
    const type = json?.error?.type || "GraphAPIError";

    throw new Error(`${type} ${code}: ${message}`);
  }

  return json;
}

async function graphRequestAll(path, params = {}) {
  const all = [];
  let page = await graphRequest(path, params);

  if (Array.isArray(page.data)) {
    all.push(...page.data);
  }

  while (page?.paging?.next) {
    page = await graphRequest(page.paging.next);
    if (Array.isArray(page.data)) {
      all.push(...page.data);
    }
  }

  return all;
}

function getActionValue(row, actionType) {
  const item = Array.isArray(row.actions)
    ? row.actions.find((action) => action.action_type === actionType)
    : null;

  return Number(item?.value || 0);
}

function getCostPerAction(row, actionType) {
  const item = Array.isArray(row.cost_per_action_type)
    ? row.cost_per_action_type.find((action) => action.action_type === actionType)
    : null;

  return Number(item?.value || 0);
}

function money(value) {
  return Number(value || 0).toFixed(2);
}

async function main() {
  console.log("\n=== META ADS DEBUG ===");
  console.log(`Graph version: ${GRAPH_VERSION}`);
  console.log(`Período: ${SINCE} até ${UNTIL}`);

  console.log("\n1) Validando token e listando contas de anúncio...");

  const adAccounts = await graphRequestAll("/me/adaccounts", {
    fields: "id,account_id,name,currency,timezone_name,account_status",
    limit: 50,
  });

  fs.writeFileSync(
    path.join(outputDir, "01-adaccounts.json"),
    JSON.stringify(adAccounts, null, 2)
  );

  console.table(
    adAccounts.map((account) => ({
      id: account.id,
      account_id: account.account_id,
      name: account.name,
      currency: account.currency,
      timezone: account.timezone_name,
      status: account.account_status,
    }))
  );

  if (!AD_ACCOUNT_ID) {
    console.log("\nNenhuma META_AD_ACCOUNT_ID foi informada.");
    console.log("Escolha uma conta da tabela acima e rode novamente com META_AD_ACCOUNT_ID.");
    return;
  }

  console.log(`\n2) Buscando insights da conta ${AD_ACCOUNT_ID}...`);

  const fields = [
    "date_start",
    "date_stop",
    "account_id",
    "account_name",
    "campaign_id",
    "campaign_name",
    "adset_id",
    "adset_name",
    "ad_id",
    "ad_name",
    "spend",
    "impressions",
    "reach",
    "clicks",
    "inline_link_clicks",
    "actions",
    "cost_per_action_type",
  ].join(",");

  const insights = await graphRequestAll(`/${AD_ACCOUNT_ID}/insights`, {
    level: "ad",
    fields,
    time_range: {
      since: SINCE,
      until: UNTIL,
    },
    limit: LIMIT,
  });

  fs.writeFileSync(
    path.join(outputDir, "02-insights-level-ad-raw.json"),
    JSON.stringify(insights, null, 2)
  );

  const summary = insights.map((row) => {
    const messagingStarted = getActionValue(
      row,
      "onsite_conversion.messaging_conversation_started_7d"
    );

    const messagingFirstReply = getActionValue(
      row,
      "onsite_conversion.messaging_first_reply"
    );

    const linkClick = getActionValue(row, "link_click");

    return {
      campaign_id: row.campaign_id || "",
      campaign_name: row.campaign_name || "",
      adset_id: row.adset_id || "",
      adset_name: row.adset_name || "",
      ad_id: row.ad_id || "",
      ad_name: row.ad_name || "",
      spend: Number(row.spend || 0),
      impressions: Number(row.impressions || 0),
      reach: Number(row.reach || 0),
      clicks: Number(row.clicks || 0),
      inline_link_clicks: Number(row.inline_link_clicks || 0),
      link_click: linkClick,
      messaging_conversation_started_7d: messagingStarted,
      messaging_first_reply: messagingFirstReply,
      cost_per_messaging_started: getCostPerAction(
        row,
        "onsite_conversion.messaging_conversation_started_7d"
      ),
    };
  });

  fs.writeFileSync(
    path.join(outputDir, "03-insights-summary.json"),
    JSON.stringify(summary, null, 2)
  );

  const csvHeader = Object.keys(summary[0] || {}).join(",");
  const csvRows = summary.map((row) =>
    Object.values(row)
      .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
      .join(",")
  );

  fs.writeFileSync(
    path.join(outputDir, "03-insights-summary.csv"),
    [csvHeader, ...csvRows].filter(Boolean).join("\n")
  );

  console.log("\nResumo por anúncio:");
  console.table(
    summary.map((row) => ({
      campanha: row.campaign_name.slice(0, 32),
      conjunto: row.adset_name.slice(0, 28),
      anuncio: row.ad_name.slice(0, 32),
      spend: money(row.spend),
      clicks: row.clicks,
      link_click: row.link_click,
      conversas_7d: row.messaging_conversation_started_7d,
      primeira_msg: row.messaging_first_reply,
    }))
  );

  const totals = summary.reduce(
    (acc, row) => {
      acc.spend += row.spend;
      acc.clicks += row.clicks;
      acc.inline_link_clicks += row.inline_link_clicks;
      acc.link_click += row.link_click;
      acc.messaging_conversation_started_7d += row.messaging_conversation_started_7d;
      acc.messaging_first_reply += row.messaging_first_reply;
      return acc;
    },
    {
      spend: 0,
      clicks: 0,
      inline_link_clicks: 0,
      link_click: 0,
      messaging_conversation_started_7d: 0,
      messaging_first_reply: 0,
    }
  );

  console.log("\nTotais do período:");
  console.table([
    {
      spend: money(totals.spend),
      clicks: totals.clicks,
      inline_link_clicks: totals.inline_link_clicks,
      link_click: totals.link_click,
      conversas_7d: totals.messaging_conversation_started_7d,
      primeira_msg: totals.messaging_first_reply,
    },
  ]);

  console.log("\n3) Buscando detalhes dos criativos dos anúncios encontrados...");

  const adIds = [...new Set(summary.map((row) => row.ad_id).filter(Boolean))].slice(0, 25);

  const adDetails = [];

  for (const adId of adIds) {
    try {
      const detail = await graphRequest(`/${adId}`, {
        fields: [
          "id",
          "name",
          "effective_status",
          "configured_status",
          "campaign{id,name}",
          "adset{id,name}",
          "creative{id,name,effective_object_story_id,thumbnail_url,object_story_spec,asset_feed_spec}",
        ].join(","),
      });

      adDetails.push(detail);
    } catch (error) {
      adDetails.push({
        id: adId,
        error: error.message,
      });
    }
  }

  fs.writeFileSync(
    path.join(outputDir, "04-ad-details-raw.json"),
    JSON.stringify(adDetails, null, 2)
  );

  console.log("\nArquivos gerados:");
  console.log(`- ${path.join(outputDir, "01-adaccounts.json")}`);
  console.log(`- ${path.join(outputDir, "02-insights-level-ad-raw.json")}`);
  console.log(`- ${path.join(outputDir, "03-insights-summary.json")}`);
  console.log(`- ${path.join(outputDir, "03-insights-summary.csv")}`);
  console.log(`- ${path.join(outputDir, "04-ad-details-raw.json")}`);

  console.log("\nPronto.");
}

main().catch((error) => {
  console.error("\nErro ao consultar Meta Ads:");
  console.error(error.message);
  process.exit(1);
});