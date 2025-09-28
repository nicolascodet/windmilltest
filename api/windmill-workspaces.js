// Find the correct workspace
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
  const workspaceFromUrl = url.pathname.match(/\/w\/([^\/]+)/)?.[1] || 'main'

  console.log('URL workspace:', workspaceFromUrl)
  console.log('Token prefix:', token?.substring(0, 10))

  try {
    // Try to list workspaces
    console.log('Fetching workspaces list...')
    const workspacesResponse = await fetch(`${baseUrl}/api/workspaces`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    let message = `**Windmill Workspace Check**\n\n`
    message += `MCP URL workspace: \`${workspaceFromUrl}\`\n`
    message += `Token: \`${token?.substring(0, 10)}...\`\n\n`

    if (workspacesResponse.ok) {
      const workspaces = await workspacesResponse.json()

      if (Array.isArray(workspaces) && workspaces.length > 0) {
        message += `**Available workspaces (${workspaces.length}):**\n`
        for (const ws of workspaces) {
          const wsId = typeof ws === 'string' ? ws : (ws.id || ws.name || ws)
          message += `• \`${wsId}\`\n`

          // Check if this workspace exists
          if (wsId) {
            const testResponse = await fetch(`${baseUrl}/api/w/${wsId}/scripts`, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            })

            if (testResponse.ok) {
              message += `  ✅ Access confirmed\n`
            }
          }
        }

        message += `\n**Solution:**\n`
        if (!workspaces.some(ws => (typeof ws === 'string' ? ws : ws.id) === workspaceFromUrl)) {
          message += `❌ Workspace '${workspaceFromUrl}' not found.\n\n`
          message += `Update your WINDMILL_MCP_URL to use one of the available workspaces:\n`
          const firstWs = typeof workspaces[0] === 'string' ? workspaces[0] : workspaces[0].id
          message += `\`${baseUrl}/api/mcp/w/${firstWs}/sse?token=${token?.substring(0, 10)}...\``
        } else {
          message += `✅ Workspace '${workspaceFromUrl}' exists`
        }
      } else {
        message += `**No workspaces found** - Check token permissions`
      }
    } else {
      // Try alternate endpoints
      console.log('Trying alternate endpoints...')

      // Try the user endpoint
      const userResponse = await fetch(`${baseUrl}/api/users/whoami`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (userResponse.ok) {
        const user = await userResponse.json()
        message += `**User info:**\n`
        message += `Email: ${user.email || 'unknown'}\n`
        message += `Username: ${user.username || 'unknown'}\n\n`
      }

      // Try common workspace names
      const commonWorkspaces = ['main', 'demo', 'default', 'starter', workspaceFromUrl]
      message += `**Testing common workspace names:**\n`

      for (const ws of commonWorkspaces) {
        const testResponse = await fetch(`${baseUrl}/api/w/${ws}/scripts`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        if (testResponse.ok) {
          message += `✅ \`${ws}\` - Works!\n`

          if (ws !== workspaceFromUrl) {
            message += `\n**Solution:** Update your WINDMILL_MCP_URL:\n`
            message += `\`${baseUrl}/api/mcp/w/${ws}/sse?token=${token?.substring(0, 10)}...\``
            break
          }
        } else {
          message += `❌ \`${ws}\` - ${testResponse.status}\n`
        }
      }
    }

    return res.json({
      success: true,
      message,
      details: {
        baseUrl,
        workspaceFromUrl,
        tokenPrefix: token?.substring(0, 10)
      }
    })

  } catch (error) {
    console.error('Error:', error)
    return res.json({
      success: false,
      message: `Error: ${error.message}\n\nTry checking your Windmill instance directly:\n${baseUrl}`,
      details: { error: error.toString() }
    })
  }
}