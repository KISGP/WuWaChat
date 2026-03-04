// 调用后端 API 发送消息
const API_URL = "http://127.0.0.1:8000";

export async function healthStatus(): Promise<boolean> {
  try {
    const data = await (await fetch(`${API_URL}`)).json();
    return data.status === "ok";
  } catch (error) {
    console.error("Health check failed:", error);
    return false;
  }
}

export async function getLogs(lines: number = 100): Promise<string[]> {
  try {
    const data = await (await fetch(`${API_URL}/logs?lines=${lines}`)).json();
    return data.logs || [];
  } catch (error) {
    console.error("Failed to fetch logs:", error);
    return [];
  }
}

export async function sendMessage({
  charId,
  text,
  signal,
  sessionId,
  modelType,
  modelId,
  apiKey,
  onComplete,
  onChunk,
  onError,
}: {
  charId: string;
  text: string;
  signal?: AbortSignal;
  sessionId?: string | null;
  modelType: string;
  modelId: string;
  apiKey?: string;
  onComplete?: () => void;
  onChunk: (chunk: string) => void;
  onError?: (error: Error) => void;
}) {
  try {
    const response = await fetch(`${API_URL}/chat/${charId}/${sessionId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: text, model_type: modelType, model_id: modelId, api_key: apiKey }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    // 处理流式纯文本响应
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) throw new Error("Response body is not readable");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      onChunk(decoder.decode(value, { stream: true }));
    }

    // 处理最后的数据
    const finalChunk = decoder.decode();
    if (finalChunk) onChunk(finalChunk);

    onComplete?.();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    onError?.(err);
    console.error("Error sending message:", err);
  }
}

export async function getAllSessions(): Promise<any> {
  try {
    const response = await fetch(`${API_URL}/sessions`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return (await response.json()).characters;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error fetching sessions:", err);
    throw err;
  }
}

export async function getSessionHistory(charId: string, sessionId: string) {
  try {
    if (!charId || !sessionId) {
      throw new Error("charId 和 sessionId 都不能为空");
    }

    const response = await fetch(`${API_URL}/history/${charId}/${sessionId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error fetching session history:", err);
    throw err;
  }
}

export async function getSupportedModels(): Promise<string[]> {
  try {
    const response = await fetch(`${API_URL}/models`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.supported_models || [];
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error fetching supported models:", err);
    throw err;
  }
}

export async function getSupportedChars(): Promise<{ id: string; name: string; avatar: string; card_bg?: string }[]> {
  try {
    const response = await fetch(`${API_URL}/chars`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.supported_chars || [];
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error fetching supported characters:", err);
    throw err;
  }
}

export async function getPrompt(charId: string): Promise<string> {
  try {
    const response = await fetch(`${API_URL}/prompt/${charId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.prompt || "";
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error fetching prompt:", err);
    throw err;
  }
}

export async function updatePrompt(charId: string, promptContent: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/prompt/${charId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: promptContent }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error updating prompt:", err);
    throw err;
  }
}

export async function testConnection(modelType: string, modelId: string, apiKey?: string): Promise<{ status: string; message: string; response?: string }> {
  try {
    const response = await fetch(`${API_URL}/test-connection`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model_type: modelType, model_id: modelId, api_key: apiKey }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      return { status: "error", message: errorData?.detail || `连接失败 (${response.status})` };
    }

    return await response.json();
  } catch (error) {
    return { status: "error", message: "无法连接到后端服务" };
  }
}