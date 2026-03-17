// Pulls live AI provider cost/latency data and formats it for Ocean Protocol
const fetch = require("node-fetch")
const fs = require("fs")
const path = require("path")

const TIMEOUT_MS = 5000

const PROVIDERS = [
  { id: "openai-gpt4o-mini",  name: "OpenAI",      model: "gpt-4o-mini",       cost_per_1k_input: 0.00015,  cost_per_1k_output: 0.0006,   ping_url: "https://api.openai.com" },
  { id: "openai-gpt4o",       name: "OpenAI",      model: "gpt-4o",            cost_per_1k_input: 0.0025,   cost_per_1k_output: 0.01,     ping_url: "https://api.openai.com" },
  { id: "anthropic-haiku",    name: "Anthropic",   model: "claude-haiku-4-5",  cost_per_1k_input: 0.00025,  cost_per_1k_output: 0.00125,  ping_url: "https://api.anthropic.com" },
  { id: "anthropic-sonnet",   name: "Anthropic",   model: "claude-sonnet-4-5", cost_per_1k_input: 0.003,    cost_per_1k_output: 0.015,    ping_url: "https://api.anthropic.com" },
  { id: "groq-llama3",        name: "Groq",        model: "llama-3.3-70b",     cost_per_1k_input: 0.00059,  cost_per_1k_output: 0.00079,  ping_url: "https://api.groq.com" },
  { id: "groq-llama3-8b",     name: "Groq",        model: "llama-3.1-8b",      cost_per_1k_input: 0.00005,  cost_per_1k_output: 0.00008,  ping_url: "https://api.groq.com" },
  { id: "together-llama3",    name: "Together",    model: "llama-3-70b",       cost_per_1k_input: 0.0009,   cost_per_1k_output: 0.0009,   ping_url: "https://api.together.xyz" },
  { id: "mistral-small",      name: "Mistral",     model: "mistral-small",     cost_per_1k_input: 0.001,    cost_per_1k_output: 0.003,    ping_url: "https://api.mistral.ai" },
  { id: "mistral-large",      name: "Mistral",     model: "mistral-large",     cost_per_1k_input: 0.003,    cost_per_1k_output: 0.009,    ping_url: "https://api.mistral.ai" },
  { id: "cohere-command",     name: "Cohere",      model: "command-r-plus",    cost_per_1k_input: 0.0025,   cost_per_1k_output: 0.01,     ping_url: "https://api.cohere.com" },
  { id: "perplexity-sonar",   name: "Perplexity",  model: "sonar-pro",         cost_per_1k_input: 0.003,    cost_per_1k_output: 0.015,    ping_url: "https://api.perplexity.ai" },
  { id: "deepseek-chat",      name: "DeepSeek",    model: "deepseek-chat",     cost_per_1k_input: 0.00014,  cost_per_1k_output: 0.00028,  ping_url: "https://api.deepseek.com" },
]

async function ping(url) {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS)
    await fetch(url, { method: "GET", signal: controller.signal })
    clearTimeout(t)
    return Date.now() - start
  } catch {
    return null
  }
}

function score(input, output, latency) {
  if (latency === null) return null
  const avgCost = (input + output * 3) / 4
  return Math.round((avgCost * 10000 * 0.7 + (latency / 100) * 0.3) * 100) / 100
}

async function generate() {
  const timestamp = new Date().toISOString()
  const latencies = await Promise.all(PROVIDERS.map(p => ping(p.ping_url)))

  const results = PROVIDERS.map((p, i) => {
    const latency_ms = latencies[i]
    return {
      id: p.id,
      name: p.name,
      model: p.model,
      cost_per_1k_input: p.cost_per_1k_input,
      cost_per_1k_output: p.cost_per_1k_output,
      latency_ms,
      available: latency_ms !== null,
      score: score(p.cost_per_1k_input, p.cost_per_1k_output, latency_ms),
    }
  })

  const available = results.filter(r => r.available).sort((a, b) => a.score - b.score)

  const feed = {
    generated_at: timestamp,
    update_interval: "6h",
    description: "AI inference provider cost and latency rankings. Ranked by composite value score (70% cost, 30% latency).",
    provider_count: results.length,
    available_count: available.length,
    best_value: available[0] || null,
    fastest: [...available].sort((a, b) => a.latency_ms - b.latency_ms)[0] || null,
    cheapest_input: [...available].sort((a, b) => a.cost_per_1k_input - b.cost_per_1k_input)[0] || null,
    cheapest_output: [...available].sort((a, b) => a.cost_per_1k_output - b.cost_per_1k_output)[0] || null,
    ranked: available,
    unavailable: results.filter(r => !r.available),
  }

  // Write to data/ directory
  const dataDir = path.join(__dirname, "data")
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir)

  const outPath = path.join(dataDir, "ai-inference-feed.json")
  fs.writeFileSync(outPath, JSON.stringify(feed, null, 2))
  console.log(`Generated: ${outPath}`)
  console.log(`Best value: ${feed.best_value?.id} (score: ${feed.best_value?.score})`)
  console.log(`Fastest: ${feed.fastest?.id} (${feed.fastest?.latency_ms}ms)`)
  console.log(`Available: ${feed.available_count}/${feed.provider_count}`)

  return feed
}

generate().catch(err => {
  console.error(err)
  process.exit(1)
})
