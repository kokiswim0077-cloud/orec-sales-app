const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";

export async function generateWithGemini({ prompt, apiKey, model = "gemini-2.5-flash", googleSearch = false, json = false, retries = 3, thinkingBudget }) {
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: googleSearch ? 0.2 : 0.1,
      maxOutputTokens: 8192,
      ...(json ? { responseMimeType: "application/json" } : {}),
      ...(Number.isInteger(thinkingBudget) ? { thinkingConfig: { thinkingBudget } } : {})
    },
    ...(googleSearch ? { tools: [{ google_search: {} }] } : {})
  };
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`${API_ROOT}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000)
      });
      if (!response.ok) {
        const details = await response.text();
        throw new Error(`Gemini API ${response.status}: ${details.slice(0, 500)}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}
