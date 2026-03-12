export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(200).json({ amount: 0, confidence: "low" });
    return;
  }

  const { imageBase64 } = req.body || {};
  if (!imageBase64) {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        max_completion_tokens: 256,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You are a financial data extractor. Look at this invoice or quotation image and extract the TOTAL AMOUNT due (the grand total or final amount). 
              
Return ONLY a JSON object in this exact format, nothing else:
{"amount": <number>, "confidence": "<high|medium|low>"}

Rules:
- amount must be a plain number with no currency symbols or commas (e.g. 45000 not AED 45,000)
- If the currency is not AED but you can identify it, still return the number as-is
- confidence should reflect how certain you are about the extracted value
- If no amount can be found, return {"amount": 0, "confidence": "low"}`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI API error:", errText);
      res.status(400).json({ error: "Failed to extract amount from image" });
      return;
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (!jsonMatch) {
      res.status(400).json({ error: "Could not parse amount from image" });
      return;
    }
    const parsed = JSON.parse(jsonMatch[0]);
    res.status(200).json({
      amount: parsed.amount ?? 0,
      confidence: parsed.confidence ?? "low",
    });
  } catch (err) {
    console.error("extract-amount error:", err);
    res.status(400).json({ error: "Failed to extract amount from image" });
  }
}
