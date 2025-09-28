// Debug version - let's see what's actually happening with Windmill API
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { prompt } = req.body
  const WINDMILL_MCP_URL = process.env.WINDMILL_MCP_URL

  if (!WINDMILL_MCP_URL) {
    return res.json({
      success: false,
      message: '❌ WINDMILL_MCP_URL not set in environment',
      details: {}
    })
  }

  // Parse the MCP URL
  const url = new URL(WINDMILL_MCP_URL)
  const baseUrl = `${url.protocol}//${url.host}`
  const token = url.searchParams.get('token')
  const workspace = url.pathname.match(/\/w\/([^\/]+)/)?.[1] || 'main'

  console.log('Debug info:', { baseUrl, workspace, hasToken: !!token })

  const debugInfo = {
    baseUrl,
    workspace,
    tokenLength: token?.length || 0,
    tokenPrefix: token?.substring(0, 10) + '...'
  }

  try {
    // Test 1: Check if we can list scripts (basic auth test)
    console.log('Test 1: Listing scripts...')
    const listResponse = await fetch(`${baseUrl}/api/w/${workspace}/scripts/list`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!listResponse.ok) {
      const error = await listResponse.text()
      return res.json({
        success: false,
        message: `❌ Failed to list scripts (${listResponse.status})`,
        details: {
          error,
          debugInfo,
          test: 'list_scripts'
        }
      })
    }

    const scripts = await listResponse.json()
    console.log(`Found ${scripts.length} scripts`)

    // Test 2: Try to create a simple test script
    const testScriptPath = 'test_script_' + Date.now()
    console.log('Test 2: Creating script:', testScriptPath)

    const createResponse = await fetch(`${baseUrl}/api/w/${workspace}/scripts/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        path: testScriptPath,
        content: 'export async function main() { return { test: "hello from windmill" } }',
        language: 'typescript',
        description: 'Test script from chat'
      })
    })

    if (!createResponse.ok) {
      const error = await createResponse.text()
      return res.json({
        success: false,
        message: `❌ Failed to create script (${createResponse.status})`,
        details: {
          error,
          debugInfo,
          test: 'create_script',
          scriptPath: testScriptPath
        }
      })
    }

    console.log('Script created successfully')

    // Test 3: Try to run the script
    console.log('Test 3: Running script...')
    const runResponse = await fetch(
      `${baseUrl}/api/w/${workspace}/jobs/run/p/${testScriptPath}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      }
    )

    if (!runResponse.ok) {
      const error = await runResponse.text()
      return res.json({
        success: false,
        message: `❌ Failed to run script (${runResponse.status})`,
        details: {
          error,
          debugInfo,
          test: 'run_script',
          scriptPath: testScriptPath,
          endpoint: `${baseUrl}/api/w/${workspace}/jobs/run/p/${testScriptPath}`
        }
      })
    }

    const jobId = await runResponse.text()
    console.log('Job started:', jobId)

    // Wait for completion
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Test 4: Get job result
    console.log('Test 4: Getting job result...')
    const resultResponse = await fetch(
      `${baseUrl}/api/w/${workspace}/jobs/get/${jobId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    )

    if (!resultResponse.ok) {
      const error = await resultResponse.text()
      return res.json({
        success: false,
        message: `❌ Failed to get job result (${resultResponse.status})`,
        details: {
          error,
          debugInfo,
          test: 'get_job',
          jobId
        }
      })
    }

    const jobData = await resultResponse.json()

    return res.json({
      success: true,
      message: `✅ All Windmill API tests passed!\n\nWindmill is connected and working.\n\nDebug info:\n• Workspace: ${workspace}\n• Scripts found: ${scripts.length}\n• Test script created: ${testScriptPath}\n• Job executed: ${jobId}\n• Result: ${JSON.stringify(jobData.result || jobData.error || 'pending')}`,
      details: {
        debugInfo,
        testsRun: ['list_scripts', 'create_script', 'run_script', 'get_job'],
        scriptPath: testScriptPath,
        jobId,
        jobData
      }
    })

  } catch (error) {
    console.error('Debug error:', error)
    return res.json({
      success: false,
      message: `❌ Error during testing: ${error.message}`,
      details: {
        error: error.toString(),
        debugInfo
      }
    })
  }
}