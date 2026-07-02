import os
from google.antigravity import Agent, LocalAgentConfig
import logging

logger = logging.getLogger("smart_analyser.agent_analyst")

def get_agent_config(system_instructions: str) -> LocalAgentConfig:
    # Google Antigravity SDK automatically reads GEMINI_API_KEY from env
    # But just in case, we check if it is set in env
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        logger.warning("GEMINI_API_KEY is not defined in environment variables.")
        
    return LocalAgentConfig(
        system_instructions=system_instructions
    )

async def generate_stock_analysis(symbol: str, tech_data: dict, news: list) -> str:
    """
    Uses the Google Antigravity SDK to write a professional Wall Street daily report.
    """
    system_instructions = (
        "You are a professional Wall Street equity research analyst. "
        "Your task is to write a highly concise, authoritative, and actionable daily analysis "
        "for a given stock ticker. Focus on technical levels, recent volume, price momentum, "
        "volatility (IV), and fundamental value. "
        "Keep your output structured, clear, and under 300 words. "
        "Write in Turkish, matching the language preference of the user."
    )
    
    news_text = "\n".join([f"- {n.get('title', '')} ({n.get('source', '')})" for n in news[:5]])
    
    prompt = (
        f"Analyze ticker: {symbol}\n\n"
        f"--- CURRENT TECHNICAL DATA ---\n"
        f"Last Close Price: ${tech_data.get('last_price', 0):.2f}\n"
        f"RSI (14): {tech_data.get('rsi', 'N/A')}\n"
        f"RVOL (Relative Volume): {tech_data.get('rvol', 'N/A')}\n"
        f"ATR (14): ${tech_data.get('atr', 0):.2f}\n"
        f"SMA 20: ${tech_data.get('sma20', 'N/A')}\n"
        f"SMA 50: ${tech_data.get('sma50', 'N/A')}\n"
        f"SMA 200: ${tech_data.get('sma200', 'N/A')}\n"
        f"Golden Cross Approach: {tech_data.get('gc_coming', False)}\n"
        f"Death Cross Approach: {tech_data.get('dc_coming', False)}\n"
        f"Pivot Point: ${tech_data.get('pivot', 0):.2f}\n"
        f"Support levels: S1=${tech_data.get('S1', 0):.2f}, S2=${tech_data.get('S2', 0):.2f}\n"
        f"Resistance levels: R1=${tech_data.get('R1', 0):.2f}, R2=${tech_data.get('R2', 0):.2f}\n"
        f"Implied Volatility (IV): {tech_data.get('iv', 0)*100:.1f}%\n\n"
        f"--- RECENT NEWS ---\n"
        f"{news_text}\n\n"
        f"Please write a 2-3 paragraph analysis. The first paragraph should highlight technical momentum "
        f"and key breakout/breakdown levels to watch. The second paragraph should interpret the recent news "
        f"and fundamental risks. The third paragraph should offer actionable, data-driven trading strategies "
        f"(e.g. options writing triggers or stock buy ranges with stop loss based on ATR)."
    )
    
    config = get_agent_config(system_instructions)
    try:
        async with Agent(config=config) as agent:
            response = await agent.chat(prompt)
            result_text = await response.text()
            return result_text
    except Exception as e:
        logger.error(f"Error generating stock analysis via Antigravity SDK: {e}")
        # Fallback to simple rules if SDK fails
        return (
            f"**{symbol} Teknik Analiz Raporu**\n\n"
            f"Fiyat ${tech_data.get('last_price', 0):.2f} seviyesinde. "
            f"RSI {tech_data.get('rsi', 'N/A')} değeriyle nötr bölgede. "
            f"Destek Raporu: S1=${tech_data.get('S1', 0):.2f}, Direnç Raporu: R1=${tech_data.get('R1', 0):.2f}.\n\n"
            f"*Not: AI Servis hatası nedeniyle detaylı rapor üretilemedi.*"
        )

async def generate_portfolio_risk_report(user_name: str, assets: list) -> str:
    """
    Uses the Google Antigravity SDK to write a daily portfolio risk assessment.
    """
    system_instructions = (
        "You are a professional chief risk officer (CRO) at a hedge fund. "
        "Your task is to review a retail user's portfolio and write a daily risk assessment "
        "focusing on asset allocation, position concentration, leverage/margin risks, "
        "and suggesting hedging techniques or tactical adjustments. "
        "CRITICAL RULE: DO NOT mention any absolute dollar amounts. Talk only in percentages, "
        "relative ratios, and asset counts. "
        "Write in Turkish, matching the language preference of the user. Keep it friendly, "
        "personalized, but alert and professional."
    )
    
    # Format asset list for the prompt
    asset_lines = []
    total_val = sum([float(a.get("value", 0)) for a in assets if a.get("value") is not None])
    
    for a in assets:
        val = float(a.get("value", 0))
        pct = (val / total_val * 100) if total_val > 0 else 0
        asset_lines.append(
            f"- {a.get('symbol')}: type={a.get('type')}, allocation={pct:.1f}%, quantity={a.get('amount')}, source={a.get('source')}"
        )
        
    assets_summary = "\n".join(asset_lines)
    
    prompt = (
        f"User: {user_name}\n"
        f"--- PORTFOLIO SUMMARY ---\n"
        f"{assets_summary}\n\n"
        f"Please write a 2-3 paragraph risk assessment. "
        f"Identify if there is any massive concentration (e.g. LUNR or options making up too much percentage). "
        f"Warn them about high margin/leverage risk (look for negative CASH positions indicating borrowing). "
        f"Provide suggestions on how to balance the portfolio or hedge risks."
    )
    
    config = get_agent_config(system_instructions)
    try:
        async with Agent(config=config) as agent:
            response = await agent.chat(prompt)
            result_text = await response.text()
            return result_text
    except Exception as e:
        logger.error(f"Error generating portfolio risk report via Antigravity SDK: {e}")
        return f"Merhaba {user_name}, portföy risk analizi şu an gerçekleştirilemiyor."

async def generate_market_weather(macro_data: dict) -> str:
    """
    Uses the Google Antigravity SDK to write a market weather forecast based on macro indicators.
    """
    system_instructions = (
        "You are a professional options trader and macro analyst. "
        "Your task is to review current macro market indicators and write a short, punchy 'Market Weather' update. "
        "Focus on what these indicators mean for someone selling options premium (e.g. VIX backwardation, credit stress in HYG, yield curves). "
        "Keep it to 2-3 sentences max. Use relevant emojis to make it readable in Telegram. "
        "Write in Turkish."
    )
    
    # Format macro data
    lines = []
    for k, v in macro_data.items():
        if v:
            lines.append(f"{k}: {v['price']:.2f} (Change: {v['change_pct']:.2f}%)")
        else:
            lines.append(f"{k}: N/A")
            
    data_summary = "\n".join(lines)
    
    prompt = (
        f"--- MACRO DATA ---\n"
        f"{data_summary}\n\n"
        f"Write a short, professional but friendly 'Piyasa Hava Durumu' (Market Weather) update for an options premium seller. "
        f"Do not just list the numbers back to me, interpret what the combination of DXY, Yields (TNX/TLT), VIX term structure (VIX/VIX9D/VIX3M), "
        f"and HYG means for the overall market health and risk of selling puts today."
    )
    
    config = get_agent_config(system_instructions)
    try:
        async with Agent(config=config) as agent:
            response = await agent.chat(prompt)
            result_text = await response.text()
            
            # Formatting the final telegram message
            header = "🌤️ **Piyasa Hava Durumu** 🌤️\n\n"
            stats = ""
            for k, v in macro_data.items():
                if v:
                    icon = "🟢" if v['change_pct'] >= 0 else "🔴"
                    stats += f"• **{k}**: {v['price']:.2f} ({icon} {v['change_pct']:.2f}%)\n"
            
            return f"{header}{stats}\n{result_text}"
            
    except Exception as e:
        logger.error(f"Error generating market weather report via Antigravity SDK: {e}")
        return "⚠️ Piyasa hava durumu analizi şu an yapılamıyor."
