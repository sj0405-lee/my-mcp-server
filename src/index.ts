import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { InferenceClient } from '@huggingface/inference'

// 서버 정보
const SERVER_NAME = 'my-mcp-server'
const SERVER_VERSION = '1.0.0'

// Create server instance
const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
    capabilities: {
        tools: {},
        resources: {},
        prompts: {}
    }
})

// 언어별 인사말 정의
const greetings: Record<string, string> = {
    korean: '안녕하세요',
    english: 'Hello',
    japanese: 'こんにちは',
    chinese: '你好',
    spanish: 'Hola',
    french: 'Bonjour',
    german: 'Hallo'
}

// greeting 도구 등록
server.tool(
    'greeting',
    '유저의 이름과 언어를 입력받아 해당 언어로 인사말을 반환합니다',
    {
        name: z.string().describe('인사할 사람의 이름'),
        language: z.string().describe('인사말 언어 (korean, english, japanese, chinese, spanish, french, german)')
    },
    async ({ name, language }) => {
        const greeting = greetings[language.toLowerCase()] || greetings['english']
        const message = `${greeting}, ${name}!`
        
        return {
            content: [
                {
                    type: 'text',
                    text: message
                }
            ]
        }
    }
)

// calc 도구 등록
server.tool(
    'calc',
    '두 개의 숫자와 연산자를 입력받아 계산 결과를 반환합니다',
    {
        num1: z.number().describe('첫 번째 숫자'),
        num2: z.number().describe('두 번째 숫자'),
        operator: z.string().describe('연산자 (+, -, *, /)')
    },
    async ({ num1, num2, operator }) => {
        let result: number

        switch (operator) {
            case '+':
                result = num1 + num2
                break
            case '-':
                result = num1 - num2
                break
            case '*':
                result = num1 * num2
                break
            case '/':
                if (num2 === 0) {
                    return {
                        content: [{ type: 'text', text: '오류: 0으로 나눌 수 없습니다' }]
                    }
                }
                result = num1 / num2
                break
            default:
                return {
                    content: [{ type: 'text', text: '오류: 지원하지 않는 연산자입니다 (+, -, *, / 만 가능)' }]
                }
        }

        return {
            content: [{ type: 'text', text: `${num1} ${operator} ${num2} = ${result}` }]
        }
    }
)

// server-info 리소스 등록
server.resource(
    'server-info',
    'server://info',
    async (uri) => {
        const serverInfo = {
            name: SERVER_NAME,
            version: SERVER_VERSION,
            tools: ['greeting', 'calc', 'time'],
            description: '인사말, 계산기, 시간 조회 기능을 제공하는 MCP 서버입니다.'
        }

        return {
            contents: [
                {
                    uri: uri.href,
                    mimeType: 'application/json',
                    text: JSON.stringify(serverInfo, null, 2)
                }
            ]
        }
    }
)

// time 도구 등록
server.tool(
    'time',
    '타임존을 입력받아 해당 지역의 현재 시간을 반환합니다',
    {
        timezone: z.string().describe('IANA 타임존 (예: Asia/Seoul, America/New_York, Europe/London)')
    },
    async ({ timezone }) => {
        try {
            const now = new Date()
            const timeString = now.toLocaleString('ko-KR', {
                timeZone: timezone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            })
            
            return {
                content: [{ type: 'text', text: `${timezone} 현재 시간: ${timeString}` }]
            }
        } catch {
            return {
                content: [{ type: 'text', text: '오류: 유효하지 않은 타임존입니다' }]
            }
        }
    }
)

// generate-image 도구 등록
server.tool(
    'generate-image',
    '프롬프트를 입력받아 AI 이미지를 생성합니다',
    {
        prompt: z.string().describe('생성할 이미지에 대한 설명 (영어 권장)')
    },
    async ({ prompt }) => {
        try {
            const client = new InferenceClient(process.env.HF_TOKEN)
            
            const image = await client.textToImage({
                model: 'stabilityai/stable-diffusion-xl-base-1.0',
                inputs: prompt
            })

            // Blob을 base64로 변환
            const blob = image as unknown as Blob
            const arrayBuffer = await blob.arrayBuffer()
            const base64 = Buffer.from(arrayBuffer).toString('base64')

            return {
                content: [
                    {
                        type: 'image',
                        data: base64,
                        mimeType: 'image/png',
                        annotations: {
                            audience: ['user'],
                            priority: 0.9
                        }
                    }
                ]
            }
        } catch (error) {
            return {
                content: [{ type: 'text', text: `이미지 생성 오류: ${error}` }]
            }
        }
    }
)

// code-review 프롬프트 등록
server.prompt(
    'code-review',
    '코드를 입력받아 코드 리뷰를 수행합니다',
    {
        code: z.string().describe('리뷰할 코드')
    },
    async ({ code }) => {
        return {
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `다음 코드를 리뷰해주세요. 아래 항목들을 확인해주세요:

1. 코드 품질: 가독성, 명명 규칙, 코드 구조
2. 버그 가능성: 잠재적인 오류나 예외 상황
3. 성능: 최적화 가능한 부분
4. 보안: 보안 취약점 여부
5. 개선 제안: 더 나은 방법이 있다면 제안

코드:
\`\`\`
${code}
\`\`\`

한국어로 상세하게 리뷰해주세요.`
                    }
                }
            ]
        }
    }
)

// 서버 시작
async function main() {
    const transport = new StdioServerTransport()
    await server.connect(transport)
}

main().catch(console.error)
