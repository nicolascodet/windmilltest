// Test Windmill connection with timeouts
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const WINDMILL_MCP_URL = process.env.WINDMILL_MCP_URL

  if (!WINDMILL_MCP_URL) {
    return res.json({
      success: false,
      message: '❌ WINDMILL_MCP_URL not set',
      details: {}
    })
  }

  // Parse URL
  const url = new URL(WINDMILL_MCP_URL)
  const baseUrl = `${url.protocol}//${url.host}`
  const token = url.searchParams.get('token')
  const workspace = url.pathname.match(/\/w\/([^\/]+)/)?.[1] || 'main'

  // Helper function to fetch with timeout
  async function fetchWithTimeout(url, options = {}, timeout = 5000) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`)
      }
      throw error
    }
  }

  const tests = []

  // Test 1: Simple health check
  try {
    console.log('Test 1: Checking Windmill API health...')
    const healthUrl = `${baseUrl}/api/version`
    const healthResponse = await fetchWithTimeout(healthUrl, {}, 3000)

    tests.push({
      test: 'API Health',
      status: healthResponse.ok ? '✅' : '❌',
      code: healthResponse.status,
      url: healthUrl
    })

    if (healthResponse.ok) {
      const version = await healthResponse.text()
      console.log('Windmill version:', version)
    }
  } catch (error) {
    tests.push({
      test: 'API Health',
      status: '❌',
      error: error.message,
      url: `${baseUrl}/api/version`
    })
  }

  // Test 2: List scripts with auth
  try {
    console.log('Test 2: Testing authentication...')
    const scriptsUrl = `${baseUrl}/api/w/${workspace}/scripts`
    const scriptsResponse = await fetchWithTimeout(scriptsUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }, 5000)

    tests.push({
      test: 'List Scripts (Auth)',
      status: scriptsResponse.ok ? '✅' : '❌',
      code: scriptsResponse.status,
      url: scriptsUrl
    })

    if (!scriptsResponse.ok) {
      const error = await scriptsResponse.text()
      tests[tests.length - 1].error = error
    }
  } catch (error) {
    tests.push({
      test: 'List Scripts (Auth)',
      status: '❌',
      error: error.message,
      url: `${baseUrl}/api/w/${workspace}/scripts`
    })
  }

  // Test 3: Try alternate endpoints
  try {
    console.log('Test 3: Testing flows endpoint...')
    const flowsUrl = `${baseUrl}/api/w/${workspace}/flows`
    const flowsResponse = await fetchWithTimeout(flowsUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }, 5000)

    tests.push({
      test: 'List Flows',
      status: flowsResponse.ok ? '✅' : '❌',
      code: flowsResponse.status,
      url: flowsUrl
    })
  } catch (error) {
    tests.push({
      test: 'List Flows',
      status: '❌',
      error: error.message
    })
  }

  // Test 4: Check workspace
  try {
    console.log('Test 4: Checking workspace info...')
    const wsUrl = `${baseUrl}/api/w/${workspace}/workspaces/get`
    const wsResponse = await fetchWithTimeout(wsUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }, 5000)

    tests.push({
      test: 'Workspace Info',
      status: wsResponse.ok ? '✅' : '❌',
      code: wsResponse.status,
      url: wsUrl
    })
  } catch (error) {
    tests.push({
      test: 'Workspace Info',
      status: '❌',
      error: error.message
    })
  }

  // Generate report
  const passed = tests.filter(t => t.status === '✅').length
  const failed = tests.filter(t => t.status === '❌').length

  let message = `**Windmill Connection Test Results**\n\n`
  message += `Workspace: \`${workspace}\`\n`
  message += `Base URL: \`${baseUrl}\`\n`
  message += `Token: \`${token?.substring(0, 10)}...\`\n\n`
  message += `**Tests: ${passed} passed, ${failed} failed**\n\n`

  for (const test of tests) {
    message += `${test.status} ${test.test}\n`
    if (test.code) message += `   Status: ${test.code}\n`
    if (test.error) message += `   Error: ${test.error}\n`
    if (test.url && test.status === '❌') message += `   URL: ${test.url}\n`
  }

  // Suggestions based on results
  if (tests[0]?.status === '❌') {
    message += `\n⚠️ Cannot reach Windmill at ${baseUrl}. Check the URL.`
  } else if (tests[1]?.status === '❌' && tests[1]?.code === 401) {
    message += `\n⚠️ Authentication failed. Check your token.`
  } else if (tests[1]?.status === '❌' && tests[1]?.code === 404) {
    message += `\n⚠️ Workspace '${workspace}' not found. Check the workspace name.`
  }

  return res.json({
    success: passed > 0,
    message,
    details: {
      tests,
      config: {
        baseUrl,
        workspace,
        tokenLength: token?.length
      }
    }
  })
}