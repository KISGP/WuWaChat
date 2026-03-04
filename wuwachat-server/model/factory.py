class LLMFactory:

    @staticmethod
    def list_supported_models():
        return ["ollama", "gemini", "deepseek", "openai", "anthropic"]

    @staticmethod
    def create(model_type: str, **kwargs):
        if model_type == "ollama":
            from langchain_ollama.chat_models import ChatOllama
            return ChatOllama(model=kwargs.get("model_id"))
        # elif model_type == "gemini":
        #     from langchain_google_genai import ChatGoogleGenerativeAI
        #     return ChatGoogleGenerativeAI(model=kwargs.get("model_id"), api_key=kwargs.get("api_key"))
        # elif model_type == "deepseek":
        #     from langchain_deepseek import ChatDeepSeek
        #     return ChatDeepSeek(model=kwargs.get("model_id"), api_key=kwargs.get("api_key"))
        # elif model_type == "openai":
        #     from langchain_openai import ChatOpenAI
        #     return ChatOpenAI(model=kwargs.get("model_id"), api_key=kwargs.get("api_key"))
        # elif model_type == "anthropic":
        #     from langchain_anthropic import ChatAnthropic
        #     return ChatAnthropic(model=kwargs.get("model_id"), api_key=kwargs.get("api_key"))
        else:
            raise ValueError(f"Unsupported model type: {model_type}")
