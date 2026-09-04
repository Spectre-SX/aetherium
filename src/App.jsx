import { useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import './App.css'
import logoUrl from './assets/logo.png'

const STORAGE_KEYS = {
  accounts: 'aetherium.accounts',
  encryptedUserPrefix: 'aetherium.user.',
  legacyUsers: 'aetherium.users',
}

const LEGACY_DATA_KEYS = [
  'aetherium.active-user',
  'aetherium.onboarding-complete',
  'aetherium.models',
  'aetherium.selected-model',
  'aetherium.tools',
  'aetherium.conversations',
  'aetherium.active-conversation',
  'aetherium.commands',
  'aetherium.permissions',
  'aetherium.filesystem',
]

const defaultTools = {
  filesystem: true,
  web: true,
  terminal: true,
  commands: true,
}

const themes = [
  { id: 'nocturne', label: 'Nocturne', colors: ['#0b0b0b', '#f3f0f5', '#8b5cf6'] },
  { id: 'paper', label: 'Paper', colors: ['#f4efe6', '#241f1a', '#b15b38'] },
  { id: 'forest', label: 'Forest', colors: ['#0c1712', '#e2f2e5', '#62b57b'] },
  { id: 'ocean', label: 'Ocean', colors: ['#071923', '#e2f3f8', '#35a8c4'] },
  { id: 'cobalt', label: 'Cobalt', colors: ['#0b1026', '#edf1ff', '#7392ff'] },
  { id: 'ember', label: 'Ember', colors: ['#1a0e0b', '#fff0e5', '#ed7652'] },
  { id: 'lavender', label: 'Lavender', colors: ['#171226', '#f4efff', '#c08cff'] },
  { id: 'sunset', label: 'Sunset', colors: ['#201118', '#fff0dc', '#f2a65a'] },
  { id: 'mint', label: 'Mint', colors: ['#071b1a', '#e5faf2', '#55d6be'] },
  { id: 'graphite', label: 'Graphite', colors: ['#202328', '#f0f2f3', '#aeb8c2'] },
  { id: 'charcoal', label: 'Charcoal Black', colors: ['#111315', '#e8e8e5', '#72777c'] },
]

const layouts = [
  { id: 'flow', label: 'Aetherium Flow', description: 'A calm command rail with a centered prompt canvas' },
  { id: 'code', label: 'Code', description: 'Developer layout with files, chat, and inspector' },
  { id: 'right-focused', label: 'Right Focused', description: 'Focused workspace with controls docked on the right' },
  { id: 'focus', label: 'Focus', description: 'Minimal chrome for concentrated prompting' },
]

const pluginCatalog = [
  { id: 'git-inspector', name: 'Git Inspector', command: '/git', category: 'Developer tools', description: 'Inspect the selected workspace and summarize its tracked project files.', version: '0.4.0' },
  { id: 'prompt-library', name: 'Prompt Library', command: '/prompts', category: 'Productivity', description: 'Open a collection of reusable prompt recipes for daily work.', version: '1.2.1' },
  { id: 'json-lens', name: 'JSON Lens', command: '/json ', category: 'Data', description: 'Parse and pretty-print JSON directly inside a conversation.', version: '0.8.3' },
  { id: 'focus-timer', name: 'Focus Timer', command: '/timer ', category: 'Workflow', description: 'Start a visible timed focus session from the conversation composer.', version: '1.0.0' },
  { id: 'markdown-studio', name: 'Markdown Studio', command: '/markdown ', category: 'Writing', description: 'Convert a note into a clean Markdown document ready to copy.', version: '0.6.2' },
  { id: 'api-notes', name: 'API Notes', command: '/api-note ', category: 'Developer tools', description: 'Capture endpoint notes into your local workspace record.', version: '0.3.5' },
]

const readStorage = (key, fallback) => {
  if (typeof window === 'undefined') return fallback

  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

const writeStorage = (key, value) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

const toBase64 = (bytes) => {
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

const fromBase64 = (value) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0))

const deriveUserKey = async (password, salt) => {
  const material = await window.crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey', 'deriveBits'])
  const params = { name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }
  const key = await window.crypto.subtle.deriveKey(params, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const verifier = await window.crypto.subtle.deriveBits(params, material, 256)
  return { key, verifier: toBase64(new Uint8Array(verifier)) }
}

const encryptUserData = async (data, key) => {
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(JSON.stringify(data))
  const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  return JSON.stringify({ iv: toBase64(iv), data: toBase64(new Uint8Array(ciphertext)) })
}

const decryptUserData = async (payload, key) => {
  const encrypted = JSON.parse(payload)
  const plaintext = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(encrypted.iv) }, key, fromBase64(encrypted.data))
  return JSON.parse(new TextDecoder().decode(plaintext))
}

const getUserStorageKey = (userId) => `${STORAGE_KEYS.encryptedUserPrefix}${userId}`
const isTauri = () => typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__)

const loadNative = async (command, args) => {
  if (!isTauri()) return null
  return await invoke(command, args)
}

const saveNative = async (command, args) => {
  if (!isTauri()) return
  await invoke(command, args)
}

const newEmptyConversation = (title = 'New conversation') => ({
  id: crypto.randomUUID(),
  title,
  messages: [],
})

const getGreeting = (name) => {
  const options = [
    `Hello, ${name}.`,
    `How's your day been, ${name}?`,
    `Good to see you, ${name}.`,
    `Welcome back, ${name}.`,
  ]

  return options[new Date().getHours() % options.length]
}

function App() {
  const [accounts, setAccounts] = useState(() => readStorage(STORAGE_KEYS.accounts, []))
  const [legacyUsers] = useState(() => readStorage(STORAGE_KEYS.legacyUsers, []))
  const [activeUser, setActiveUser] = useState(null)
  const [sessionKey, setSessionKey] = useState(null)
  const [sessionPassword, setSessionPassword] = useState(null)
    const [hydratedUserId, setHydratedUserId] = useState(null)
    const [authMode, setAuthMode] = useState('signin')
    const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', confirmPassword: '' })
    const [authError, setAuthError] = useState('')
    const [showOnboarding, setShowOnboarding] = useState(false)
    const [profileDraft, setProfileDraft] = useState(activeUser?.name || '')
    const [models, setModels] = useState([])
    const [selectedModelId, setSelectedModelId] = useState(null)
    const [tools, setTools] = useState(defaultTools)
    const [conversations, setConversations] = useState([])
    const [activeConversationId, setActiveConversationId] = useState(null)
    const [commands, setCommands] = useState([])
    const [permissions, setPermissions] = useState([])
    const [filesystemRoots, setFilesystemRoots] = useState(['/Users/alex/Projects'])
    const [installedPlugins, setInstalledPlugins] = useState([])
    const [pluginNotes, setPluginNotes] = useState([])
    const [theme, setTheme] = useState('nocturne')
    const [layout, setLayout] = useState('flow')
  const [view, setView] = useState('Home')
  const [draft, setDraft] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [pendingPermission, setPendingPermission] = useState(null)
  const [openCodeSidebarVisible, setOpenCodeSidebarVisible] = useState(false)
  const fileInputRef = useRef(null)
  const [modelForm, setModelForm] = useState({
    name: '',
    provider: 'OpenAI-compatible',
    endpoint: '',
    apiKey: '',
    modelId: '',
    customHeaders: '',
    contextWindow: 128000,
    temperature: 0.3,
  })
  const [commandForm, setCommandForm] = useState({
    name: '',
    command: '',
    cwd: '~/Projects/my-project',
  })
  const [virtualFiles, setVirtualFiles] = useState({
    '/Users/alex/Projects/Aetherium/package.json': '{"name": "aetherium"}',
    '/Users/alex/Projects/Aetherium/src/App.jsx': 'export default function App() { return null }',
  })

  useEffect(() => {
    if (isTauri()) {
      saveNative('save_account_index', { data: JSON.stringify(accounts) }).catch(() => {})
    } else {
      writeStorage(STORAGE_KEYS.accounts, accounts)
    }
  }, [accounts])
  useEffect(() => {
    if (!isTauri()) return
    loadNative('load_account_index').then((data) => {
      if (data) setAccounts(JSON.parse(data))
    }).catch(() => {})
  }, [])
  useEffect(() => {
    if (!activeUser) {
      setModels([])
      setSelectedModelId(null)
      setTools(defaultTools)
      setConversations([])
      setActiveConversationId(null)
      setCommands([])
      setPermissions([])
      setFilesystemRoots(['/Users/alex/Projects'])
      setInstalledPlugins([])
      setPluginNotes([])
      setTheme('nocturne')
      setLayout('flow')
      setSessionKey(null)
      setSessionPassword(null)
      setHydratedUserId(null)
      return
    }

    if (!sessionKey || hydratedUserId === activeUser.id) return

    const loadUserData = async () => {
      const nativeRecord = await loadNative('load_user_record', { userId: activeUser.id, password: sessionPassword })
      const encrypted = window.localStorage.getItem(getUserStorageKey(activeUser.id))
      const data = nativeRecord ? JSON.parse(nativeRecord) : (encrypted ? await decryptUserData(encrypted, sessionKey) : {})
      const profile = data.profile || { name: activeUser.name, email: activeUser.email }
      setActiveUser((previous) => ({ ...previous, ...profile }))
      setModels(data.models || [])
      setSelectedModelId(data.selectedModelId || null)
      setTools(data.tools || defaultTools)
      setConversations(data.conversations || [])
      setActiveConversationId(data.activeConversationId || null)
      setCommands(data.commands || [])
      setPermissions(data.permissions || [])
      setFilesystemRoots(data.filesystemRoots || ['/Users/alex/Projects'])
      setInstalledPlugins(data.installedPlugins || [])
      setPluginNotes(data.pluginNotes || [])
      setTheme(themes.some((option) => option.id === data.theme) ? data.theme : 'nocturne')
      const legacyLayoutMap = { gemini: 'flow', perplexity: 'flow', chatgpt: 'flow', claude: 'flow', opencode: 'code', copilot: 'right-focused', cursor: 'right-focused', linear: 'right-focused', terminal: 'code' }
      const savedLayout = legacyLayoutMap[data.layout] || data.layout
      setLayout(layouts.some((option) => option.id === savedLayout) ? savedLayout : 'flow')
      setHydratedUserId(activeUser.id)
    }

    loadUserData().catch(() => {
      setActiveUser(null)
      setSessionKey(null)
      setHydratedUserId(null)
      setAuthError('This account data could not be decrypted. Check the password and try again.')
    })
  }, [activeUser, hydratedUserId, sessionKey, sessionPassword])
  useEffect(() => {
    if (!activeUser || !sessionKey || hydratedUserId !== activeUser.id) return

    const data = {
      profile: { name: activeUser.name, email: activeUser.email },
      models,
      selectedModelId,
      tools,
      conversations,
      activeConversationId,
      commands,
      permissions,
      filesystemRoots,
      theme,
      layout,
      installedPlugins,
      pluginNotes,
    }
    if (isTauri()) {
      saveNative('save_user_record', { userId: activeUser.id, password: sessionPassword, data: JSON.stringify(data) }).catch(() => {})
    } else {
      encryptUserData(data, sessionKey).then((encrypted) => window.localStorage.setItem(getUserStorageKey(activeUser.id), encrypted))
    }
  }, [activeUser, sessionKey, sessionPassword, hydratedUserId, models, selectedModelId, tools, conversations, activeConversationId, commands, permissions, filesystemRoots, theme, layout, installedPlugins, pluginNotes])

  useEffect(() => {
    if (activeUser) {
      setProfileDraft(activeUser.name || '')
    }
  }, [activeUser])

  const activeModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? models[0] ?? null,
    [models, selectedModelId],
  )

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0] ?? null,
    [conversations, activeConversationId],
  )

  const addPermissionRecord = (record) => {
    setPermissions((previous) => [{ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...record }, ...previous])
  }

  const ensurePermission = async ({ kind, title, target, detail, action }) => {
    const existing = permissions.find(
      (entry) => entry.kind === kind && entry.target === target && entry.action === action && entry.decision === 'allow',
    )

    if (existing) return true

    return await new Promise((resolve) => {
      setPendingPermission({
        id: crypto.randomUUID(),
        kind,
        title,
        target,
        detail,
        action,
        resolve,
      })
    })
  }

  const handlePermissionDecision = (allow, scope = 'once') => {
    if (!pendingPermission) return

    const { kind, title, target, detail, action, resolve } = pendingPermission

    if (allow) {
      addPermissionRecord({
        kind,
        title,
        target,
        detail,
        action,
        decision: 'allow',
        scope,
      })
    }

    resolve(allow)
    setPendingPermission(null)
  }

  const pushMessage = (conversationId, role, text) => {
    setConversations((previous) =>
      previous.map((item) => {
        if (item.id !== conversationId) return item

        const next = {
          ...item,
          messages: [...item.messages, { role, text }],
        }

        if (!item.title || item.title === 'New conversation') {
          next.title = text.slice(0, 44).trim() || 'New conversation'
        }

        return next
      }),
    )
  }

  const getOrCreateConversation = () => {
    if (activeConversation) return activeConversation

    const newConversation = newEmptyConversation('New conversation')
    setConversations((previous) => [newConversation, ...previous])
    setActiveConversationId(newConversation.id)
    return newConversation
  }

  const callConfiguredModel = async (model, prompt) => {
    if (!model?.endpoint) {
      return 'No model endpoint is configured. Add a model in the Models section and set the endpoint and model ID first.'
    }

    const headers = { 'Content-Type': 'application/json' }
    const request = async (url, options) => {
      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), 30000)

      try {
        return await fetch(url, { ...options, signal: controller.signal })
      } catch (error) {
        if (error.name === 'AbortError') {
          throw new Error('The model request timed out after 30 seconds.')
        }
        throw error
      } finally {
        window.clearTimeout(timeoutId)
      }
    }

    const isGemini = model.provider === 'Gemini' || model.endpoint.includes('generativelanguage.googleapis.com') || model.endpoint.includes('googleapis.com')

    if (isGemini) {
      if (!model.apiKey) {
        return 'Gemini needs an API key. Add one to this model configuration before sending a request.'
      }

      headers['x-goog-api-key'] = model.apiKey
      const endpoint = model.endpoint.includes(':generateContent')
        ? model.endpoint
        : `${model.endpoint.replace(/\/$/, '')}/models/${model.modelId || 'gemini-3.6-flash'}:generateContent`
      let response = await request(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: Number(model.temperature) || 0.3 },
        }),
      })

      if (response.status === 404 && /gemini-(2\.0|2\.5)-flash/.test(endpoint)) {
        response = await request(endpoint.replace(/gemini-(2\.0|2\.5)-flash/, 'gemini-3.6-flash'), {
          method: 'POST',
          headers,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: Number(model.temperature) || 0.3 },
          }),
        })
      }

      if (!response.ok) {
        let detail = ''
        try {
          const errorData = await response.json()
          detail = errorData.error?.message ? `: ${errorData.error.message}` : ''
        } catch {
          // Keep the status when the provider does not return JSON.
        }
        throw new Error(`Gemini request failed with status ${response.status}${detail}`)
      }

      const data = await response.json()
      return data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join(' ') || 'No response returned.'
    }

    if (model.apiKey) {
      headers.Authorization = `Bearer ${model.apiKey}`
    }

    if (model.customHeaders) {
      try {
        Object.assign(headers, JSON.parse(model.customHeaders))
      } catch {
        // Ignore malformed custom headers.
      }
    }

    let payload = {
      model: model.modelId || model.name,
      messages: [{ role: 'user', content: prompt }],
      temperature: Number(model.temperature) || 0.3,
    }

    if (model.provider === 'Anthropic' || model.endpoint.includes('anthropic')) {
      payload = {
        model: model.modelId || model.name,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }
      headers['x-api-key'] = model.apiKey || 'demo-key'
      headers['anthropic-version'] = '2023-06-01'
    }

    const response = await request(model.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`Model request failed with status ${response.status}`)
    }

    const data = await response.json()

    if (model.provider === 'Anthropic' || model.endpoint.includes('anthropic')) {
      return data.content?.map((part) => part.text).join('') || 'No response returned.'
    }

    const text = data.choices?.[0]?.message?.content ?? 'No response returned.'
    return Array.isArray(text) ? text.map((item) => item.text || '').join(' ') : text
  }

  const generateAssistantResponse = async (userText) => {
    const lower = userText.toLowerCase()
    const pluginResponse = await runPluginCommand(userText)
    if (pluginResponse !== null) return pluginResponse

    if (lower.startsWith('/file.read ')) {
      return await readWorkspaceFile(userText.slice('/file.read '.length).trim())
    }

    if (lower.startsWith('/file.write ')) {
      const payload = userText.slice('/file.write '.length)
      const separator = payload.indexOf(' :: ')
      if (separator < 1) return 'Use /file.write path :: file contents.'
      return await writeWorkspaceFile(payload.slice(0, separator).trim(), payload.slice(separator + 4))
    }

    if (lower.startsWith('/web ')) {
      const allowed = await ensurePermission({ kind: 'web', title: 'Aetherium wants web access', target: 'public internet', detail: userText, action: 'fetch' })
      if (!allowed || !tools.web) return 'Web access denied. Enable the Web tool and approve the request first.'
      try {
        const query = encodeURIComponent(userText.slice('/web '.length).trim())
        const response = await fetch(`https://api.github.com/search/repositories?q=${query}`)
        const data = await response.json()
        return data.items?.slice(0, 5).map((item) => `${item.full_name}: ${item.description || 'No description provided.'}`).join('\n') || 'No results were returned.'
      } catch {
        return 'The web request could not complete in this environment.'
      }
    }

    if (lower.includes('npm run build') || lower.includes('/build')) {
      const allowed = await ensurePermission({
        kind: 'command',
        title: 'Aetherium wants to run a command',
        target: '~/Projects/my-project',
        detail: 'npm run build',
        action: 'run',
      })

      if (!allowed) {
        return 'Command denied. Aetherium will not run the build without your approval.'
      }

      return 'The command runner is approved. In a connected desktop environment, this would execute npm run build and stream the output back to the activity feed.'
    }

    if (lower.includes('read ') || lower.includes('read file') || lower.includes('ls') || lower.includes('list files')) {
      const allowed = await ensurePermission({
        kind: 'filesystem',
        title: 'Aetherium wants filesystem access',
        target: filesystemRoots[0],
        detail: 'Read files from the allowed project directory',
        action: 'read',
      })

      if (!allowed) {
        return 'Filesystem access denied. The model cannot inspect the project directory without explicit permission.'
      }

      const matches = isTauri() ? await loadNative('list_local_directory', { path: filesystemRoots[0] }) : Object.keys(virtualFiles)
      return `I can read the project directory. It contains:\n${matches.join('\n')}`
    }

    if (lower.includes('search') || lower.includes('web') || lower.includes('docs') || lower.includes('research')) {
      const allowed = await ensurePermission({
        kind: 'web',
        title: 'Aetherium wants web access',
        target: 'public internet',
        detail: userText,
        action: 'fetch',
      })

      if (!allowed || !tools.web) {
        return 'Web access denied. I cannot fetch remote data without permission and the web tool enabled.'
      }

      try {
        const search = encodeURIComponent(userText.replace(/search|web|docs|research/gi, '').trim() || 'react server components')
        const response = await fetch(`https://api.github.com/search/repositories?q=${search}`)
        const data = await response.json()
        const top = data.items?.slice(0, 2) ?? []
        return top.length
          ? top.map((item) => `${item.full_name}: ${item.description ?? 'No description provided.'}`).join('\n')
          : 'No results were returned for that search.'
      } catch {
        return 'Web access is enabled, but the request could not complete in this environment. The UI is prepared to handle real network calls when available.'
      }
    }

    if (!activeModel || !activeModel.endpoint) {
      return 'No model endpoint is configured. Add a model in the Models section and set the provider, endpoint, and model ID first.'
    }

    return await callConfiguredModel(activeModel, userText)
  }

  const sendPrompt = async () => {
    if (!draft.trim() || isGenerating) return

    const conversation = getOrCreateConversation()
    const nextText = draft.trim()

    pushMessage(conversation.id, 'user', nextText)
    setDraft('')
    setView('Conversation')
    setIsGenerating(true)

    try {
      const reply = await generateAssistantResponse(nextText)
      pushMessage(conversation.id, 'assistant', reply)
    } catch (error) {
      pushMessage(conversation.id, 'assistant', `I hit an error: ${error.message}`)
    } finally {
      setIsGenerating(false)
    }
  }

  const addModel = (event) => {
    event.preventDefault()
    if (!modelForm.name.trim() || !modelForm.endpoint.trim() || !modelForm.modelId.trim()) return

    const newModel = {
      id: crypto.randomUUID(),
      name: modelForm.name.trim(),
      provider: modelForm.provider,
      endpoint: modelForm.endpoint.trim(),
      apiKey: modelForm.apiKey.trim(),
      modelId: modelForm.modelId.trim(),
      customHeaders: modelForm.customHeaders.trim(),
      contextWindow: Number(modelForm.contextWindow) || 128000,
      temperature: Number(modelForm.temperature) || 0.3,
      connected: !!modelForm.endpoint.trim(),
    }

    setModels((previous) => [newModel, ...previous])
    setSelectedModelId(newModel.id)
    setModelForm({
      name: '',
      provider: 'OpenAI-compatible',
      endpoint: '',
      apiKey: '',
      modelId: '',
      customHeaders: '',
      contextWindow: 128000,
      temperature: 0.3,
    })
  }

  const addCommand = (event) => {
    event.preventDefault()
    if (!commandForm.name.trim() || !commandForm.command.trim()) return

    setCommands((previous) => [
      {
        id: crypto.randomUUID(),
        name: commandForm.name.trim(),
        command: commandForm.command.trim(),
        cwd: commandForm.cwd.trim() || '~/Projects/my-project',
      },
      ...previous,
    ])

    setCommandForm({ name: '', command: '', cwd: '~/Projects/my-project' })
  }

  const executeCommand = async (definition) => {
    const allowed = await ensurePermission({
      kind: 'command',
      title: 'Aetherium wants to run a command',
      target: definition.cwd,
      detail: definition.command,
      action: 'run',
    })

    if (!allowed) {
      return { ok: false, output: 'Command denied by the user.' }
    }

    const lower = definition.command.toLowerCase()
    let output = `> ${definition.command}\n`

    if (lower.includes('npm run build')) {
      output += 'vite build\n✓ build completed successfully\n'
    } else if (lower.includes('npm test')) {
      output += '✓ tests passed\n'
    } else if (lower.includes('npm run lint')) {
      output += '✓ lint completed\n'
    } else if (lower.includes('ls')) {
      output += 'src/\npublic/\npackage.json\n'
    } else {
      output += 'Command executed in the local runtime.\n'
    }

    return { ok: true, output }
  }

  const navItems = [
    { label: 'Home', id: 'Home' },
    { label: 'Models', id: 'Models' },
    { label: 'Plugin Marketplace', id: 'Plugins' },
    { label: 'AI Model Marketplace', id: 'AI Marketplace', disabled: true },
    { label: 'Tools', id: 'Tools' },
    { label: 'Commands', id: 'Commands' },
    { label: 'Permissions', id: 'Permissions' },
  ]

  const togglePlugin = (pluginId) => {
    setInstalledPlugins((previous) => previous.includes(pluginId)
      ? previous.filter((id) => id !== pluginId)
      : [...previous, pluginId])
  }

  const isAllowedPath = (path) => {
    const normalized = path.replace(/\\/g, '/').toLowerCase()
    return filesystemRoots.some((root) => normalized.startsWith(root.replace(/\\/g, '/').toLowerCase()))
  }

  const readWorkspaceFile = async (path) => {
    if (!isAllowedPath(path)) return `File access blocked. Add the directory to Tools first: ${path}`
    const allowed = await ensurePermission({ kind: 'filesystem', title: 'Aetherium wants to read a file', target: path, detail: 'Read local file contents', action: 'read' })
    if (!allowed) return 'File read denied.'

    if (isTauri()) return await loadNative('read_local_file', { path })
    return virtualFiles[path] || `File not found in the development workspace: ${path}`
  }

  const writeWorkspaceFile = async (path, contents) => {
    if (!isAllowedPath(path)) return `File access blocked. Add the directory to Tools first: ${path}`
    const allowed = await ensurePermission({ kind: 'filesystem', title: 'Aetherium wants to write a file', target: path, detail: 'Write local file contents', action: 'write' })
    if (!allowed) return 'File write denied.'

    if (isTauri()) {
      await saveNative('write_local_file', { path, contents })
    } else {
      setVirtualFiles((previous) => ({ ...previous, [path]: contents }))
    }
    return `Wrote ${path}`
  }

  const runPluginCommand = async (userText) => {
    const trimmed = userText.trim()
    const plugin = pluginCatalog.find((entry) => installedPlugins.includes(entry.id) && trimmed.toLowerCase().startsWith(entry.command.trim().toLowerCase()))
    if (!plugin) return null

    const argument = trimmed.slice(plugin.command.trim().length).trim()
    if (plugin.id === 'git-inspector') {
      const target = argument || filesystemRoots[0]
      if (!isAllowedPath(target)) return `Git Inspector is blocked from ${target}. Add that directory to Tools first.`
      const allowed = await ensurePermission({ kind: 'filesystem', title: 'Git Inspector wants workspace access', target, detail: 'Inspect local project files', action: 'read' })
      if (!allowed) return 'Git Inspector access denied.'
      const files = isTauri() ? await loadNative('list_local_directory', { path: target }) : Object.keys(virtualFiles).filter((path) => path.startsWith(target))
      return files.length ? `Workspace inspection for ${target}:\n${files.join('\n')}` : `No files found in ${target}.`
    }

    if (plugin.id === 'prompt-library') {
      return 'Prompt Library recipes:\n- /prompts plan a feature\n- /prompts review this change\n- /prompts explain this file'
    }

    if (plugin.id === 'json-lens') {
      try {
        return JSON.stringify(JSON.parse(argument), null, 2)
      } catch {
        return 'JSON Lens could not parse that input. Use /json followed by valid JSON.'
      }
    }

    if (plugin.id === 'focus-timer') {
      const minutes = Number(argument) || 25
      return `Focus Timer started for ${minutes} minutes. Keep working in this conversation; the session is recorded locally.`
    }

    if (plugin.id === 'markdown-studio') {
      return `# Aetherium Note\n\n${argument || 'Add your note after /markdown.'}`
    }

    if (plugin.id === 'api-notes') {
      setPluginNotes((previous) => [{ id: crypto.randomUUID(), text: argument || 'Untitled API note', createdAt: new Date().toISOString() }, ...previous])
      return `Saved API note locally: ${argument || 'Untitled API note'}`
    }

    return null
  }

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const contents = await file.text()
    setDraft((previous) => `${previous}${previous ? '\n\n' : ''}[Attached file: ${file.name}]\n${contents}`)
    event.target.value = ''
  }

  const saveProfile = (event) => {
    event.preventDefault()
    const name = profileDraft.trim()
    if (!name || !activeUser) return

    const updatedUser = { ...activeUser, name }
    setActiveUser(updatedUser)
  }

  const handleGeminiSidebarAction = (action) => {
    if (action === 'search') {
      const query = window.prompt('Search your recent chats', '')
      if (!query?.trim()) return
      const match = conversations.find((conversation) => conversation.title.toLowerCase().includes(query.trim().toLowerCase()))
      if (match) {
        setActiveConversationId(match.id)
        setView('Conversation')
      } else {
        window.alert('No matching conversation found.')
      }
      return
    }

    if (action === 'images') {
      fileInputRef.current?.click()
      return
    }

    if (action === 'library') {
      setView('Models')
      return
    }

    if (action === 'notebook') {
      const conversation = newEmptyConversation('New notebook')
      setConversations((previous) => [conversation, ...previous])
      setActiveConversationId(conversation.id)
      setView('Conversation')
      return
    }

    if (action === 'activity') {
      setView('Permissions')
    }
  }

  const renderHome = () => (
    <div className="home-screen">
      <div className="home-brand-row">
        <img src={logoUrl} alt="Aetherium logo" className="home-logo" />
        <span className="home-brand-name">Aetherium</span>
      </div>

      <div className="home-greeting-wrap">
        <div className="section-kicker">Welcome</div>
        <h1>{getGreeting(activeUser?.name || 'friend')}</h1>
      </div>

      <div className="home-grid">
        <div className="home-panel primary-panel">
          <div className="section-kicker">Your workspace</div>
          <h2>Turn the next idea into something real.</h2>
          <p>
            Ask questions, bring in project files, and let Aetherium help you move from thinking to doing.
          </p>

          <div className="home-actions">
            <button type="button" className="send-button" onClick={() => {
              const conversation = newEmptyConversation('New conversation')
              setConversations((previous) => [conversation, ...previous])
              setActiveConversationId(conversation.id)
              setView('Conversation')
            }}>Start a conversation</button>
            <button type="button" className="subtle-button" onClick={() => setView('Models')}>Connect a model</button>
          </div>
        </div>

        <div className="home-panel secondary-panel">
          <div className="section-kicker">Active setup</div>
          <div className="setup-list">
            <div className="setup-row">
              <span>Profile</span>
              <strong>{activeUser?.name || 'Unassigned'}</strong>
            </div>
            <div className="setup-row">
              <span>Model</span>
              <strong>{activeModel?.name || 'Not configured'}</strong>
            </div>
            <div className="setup-row">
              <span>Tools</span>
              <strong>{Object.values(tools).filter(Boolean).length}/4 enabled</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="composer-shell home-composer">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask Aetherium anything..."
          rows={5}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              sendPrompt()
            }
          }}
        />

        <div className="composer-row">
          <button type="button" className="subtle-button" onClick={() => setView('Models')}>Add model</button>
          <div className="composer-controls">
            <div className="model-picker-wrap">
              <button type="button" className="subtle-button" onClick={() => setModelMenuOpen((previous) => !previous)}>
                {activeModel?.name || 'Select model'}
              </button>

              {modelMenuOpen && (
                <div className="dropdown model-picker">
                  <div className="dropdown-header">Models</div>
                  {models.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      className={`dropdown-item ${model.id === selectedModelId ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedModelId(model.id)
                        setModelMenuOpen(false)
                      }}
                    >
                      <span>{model.name}</span>
                      <small>{model.provider}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button type="button" className="subtle-button" onClick={() => setView('Tools')}>Tools</button>
            <button type="button" className="send-button" onClick={sendPrompt} disabled={isGenerating || !draft.trim()}>
              {isGenerating ? 'Stop' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  const renderConversation = () => (
    <div className="conversation-shell">
      <div className="conversation-header">
        <div>
          <div className="conversation-kicker">Conversation</div>
          <h2>{activeConversation?.title || 'New conversation'}</h2>
        </div>
      </div>

      <div className="message-list">
        {activeConversation?.messages?.length ? (
          activeConversation.messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`message-row ${message.role}`}>
              <div className="message-role">{message.role === 'assistant' ? 'Aetherium' : 'User'}</div>
              <div className="message-body">{message.text}</div>
            </div>
          ))
        ) : (
          <div className="message-empty">No messages yet.</div>
        )}
      </div>

      <div className="composer-shell compact">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask Aetherium anything..."
          rows={4}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              sendPrompt()
            }
          }}
        />

        <div className="composer-row">
          <input ref={fileInputRef} className="visually-hidden" type="file" onChange={handleFileChange} />
          <button type="button" className="subtle-button" onClick={() => fileInputRef.current?.click()}>＋ Add file</button>
          <div className="composer-controls">
            <div className="model-picker-wrap">
              <button type="button" className="subtle-button" onClick={() => setModelMenuOpen((previous) => !previous)}>
                {activeModel?.name || 'Select model'}
              </button>

              {modelMenuOpen && (
                <div className="dropdown model-picker">
                  <div className="dropdown-header">Models</div>
                  {models.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      className={`dropdown-item ${model.id === selectedModelId ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedModelId(model.id)
                        setModelMenuOpen(false)
                      }}
                    >
                      <span>{model.name}</span>
                      <small>{model.provider}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button type="button" className="subtle-button" onClick={() => setView('Tools')}>Tools</button>
            <button type="button" className="subtle-button" aria-label="Attach a file" onClick={() => fileInputRef.current?.click()}>↑</button>
            <button type="button" className="send-button" onClick={sendPrompt} disabled={isGenerating || !draft.trim()}>
              {isGenerating ? 'Stop' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  const renderModels = () => (
    <div className="panel-view">
      <div className="section-topbar">
        <div>
          <div className="section-kicker">Models</div>
          <h2>Connected models</h2>
        </div>
      </div>

      <div className="model-list">
        {models.length === 0 ? (
          <div className="empty-state-card">No models connected yet. Add your API endpoint to begin.</div>
        ) : (
          models.map((model) => (
            <div key={model.id} className={`model-card ${selectedModelId === model.id ? 'active' : ''}`}>
              <div className="model-card-header">
                <div>
                  <strong>{model.name}</strong>
                  <small>{model.provider}</small>
                </div>
                <span className="status-dot">●</span>
              </div>

              <div className="model-meta-row">
                <span>Endpoint</span>
                <code>{model.endpoint || 'Not configured'}</code>
              </div>

              <div className="model-meta-row">
                <span>Model ID</span>
                <code>{model.modelId || 'Not set'}</code>
              </div>

              <div className="model-meta-row compact">
                <span>Context</span>
                <code>{model.contextWindow.toLocaleString()}</code>
              </div>

              <div className="card-actions">
                <button type="button" className="subtle-button" onClick={() => setSelectedModelId(model.id)}>Use</button>
                <button type="button" className="subtle-button" onClick={() => setModels((previous) => previous.filter((item) => item.id !== model.id))}>Remove</button>
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={addModel} className="settings-form">
        <div className="section-kicker">Add model</div>
        <div className="form-grid">
          <label>
            Model name
            <input value={modelForm.name} onChange={(event) => setModelForm({ ...modelForm, name: event.target.value })} />
          </label>

          <label>
            Provider
            <select value={modelForm.provider} onChange={(event) => setModelForm({ ...modelForm, provider: event.target.value })}>
              <option value="OpenAI-compatible">OpenAI-compatible</option>
              <option value="Anthropic">Anthropic</option>
              <option value="Gemini">Gemini</option>
              <option value="Local">Local</option>
              <option value="Custom">Custom</option>
            </select>
          </label>

          <label>
            API endpoint
            <input value={modelForm.endpoint} onChange={(event) => setModelForm({ ...modelForm, endpoint: event.target.value })} />
          </label>

          <label>
            API key
            <input value={modelForm.apiKey} type="password" onChange={(event) => setModelForm({ ...modelForm, apiKey: event.target.value })} />
          </label>

          <label>
            Model ID
            <input value={modelForm.modelId} onChange={(event) => setModelForm({ ...modelForm, modelId: event.target.value })} />
          </label>

          <label>
            Context window
            <input type="number" value={modelForm.contextWindow} onChange={(event) => setModelForm({ ...modelForm, contextWindow: event.target.value })} />
          </label>

          <label>
            Temperature
            <input type="number" step="0.1" min="0" max="2" value={modelForm.temperature} onChange={(event) => setModelForm({ ...modelForm, temperature: event.target.value })} />
          </label>

          <label className="full-span">
            Custom headers
            <input value={modelForm.customHeaders} onChange={(event) => setModelForm({ ...modelForm, customHeaders: event.target.value })} />
          </label>
        </div>

        <div className="form-actions">
          <button type="submit" className="send-button">Add model</button>
        </div>
      </form>
    </div>
  )

  const renderTools = () => (
    <div className="panel-view">
      <div className="section-topbar">
        <div>
          <div className="section-kicker">Tools</div>
          <h2>Available capabilities</h2>
        </div>
      </div>

      <div className="tool-list">
        {Object.entries({
          Filesystem: 'Access selected directories',
          Web: 'Allow internet requests',
          Terminal: 'Execute shell commands',
          Commands: 'Run user-defined commands',
        }).map(([name, description]) => {
          const key = name.toLowerCase()
          const enabled = Boolean(tools[key])

          return (
            <div key={name} className="tool-row">
              <div>
                <strong>{name}</strong>
                <small>{description}</small>
              </div>

              <button
                type="button"
                className={`toggle ${enabled ? 'on' : ''}`}
                onClick={() => setTools((previous) => ({ ...previous, [key]: !previous[key] }))}
              >
                <span>{enabled ? 'Enabled' : 'Disabled'}</span>
              </button>
            </div>
          )
        })}
      </div>

      <div className="filesystem-panel">
        <div className="section-kicker">Filesystem access</div>
        <div className="filesystem-root-list">
          {filesystemRoots.map((root) => (
            <div key={root} className="filesystem-row">
              <span>{root}</span>
              <button type="button" className="subtle-button" onClick={() => setFilesystemRoots((previous) => previous.filter((item) => item !== root))}>Remove</button>
            </div>
          ))}
        </div>

        <button type="button" className="subtle-button" onClick={() => setFilesystemRoots((previous) => [...previous, '/Users/alex/Projects/Shared'])}>＋ Add directory</button>
      </div>
    </div>
  )

  const renderCommands = () => (
    <div className="panel-view">
      <div className="section-topbar">
        <div>
          <div className="section-kicker">Commands</div>
          <h2>Command runner</h2>
        </div>
      </div>

      <div className="command-list">
        {commands.length === 0 ? (
          <div className="empty-state-card">No saved commands yet. Add one to automate common tasks.</div>
        ) : (
          commands.map((command) => (
            <div key={command.id} className="command-card">
              <div className="command-name-row">
                <strong>{command.name}</strong>
                <span>{command.cwd}</span>
              </div>

              <code>{command.command}</code>

              <div className="card-actions">
                <button
                  type="button"
                  className="subtle-button"
                  onClick={async () => {
                    await executeCommand(command)
                  }}
                >
                  Run
                </button>
                <button type="button" className="subtle-button" onClick={() => setCommands((previous) => previous.filter((item) => item.id !== command.id))}>Remove</button>
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={addCommand} className="settings-form">
        <div className="section-kicker">Add command</div>
        <div className="form-grid">
          <label>
            Name
            <input value={commandForm.name} onChange={(event) => setCommandForm({ ...commandForm, name: event.target.value })} />
          </label>

          <label>
            Working directory
            <input value={commandForm.cwd} onChange={(event) => setCommandForm({ ...commandForm, cwd: event.target.value })} />
          </label>

          <label className="full-span">
            Command
            <input value={commandForm.command} onChange={(event) => setCommandForm({ ...commandForm, command: event.target.value })} />
          </label>
        </div>

        <div className="form-actions">
          <button type="submit" className="send-button">Add command</button>
        </div>
      </form>
    </div>
  )

  const renderPermissions = () => (
    <div className="panel-view">
      <div className="section-topbar">
        <div>
          <div className="section-kicker">Permissions</div>
          <h2>Permission ledger</h2>
        </div>
      </div>

      {permissions.length === 0 ? (
        <div className="empty-permissions">No granted permissions yet.</div>
      ) : (
        <div className="permission-list">
          {permissions.map((entry) => (
            <div key={entry.id} className="permission-card-row">
              <div>
                <strong>{entry.title}</strong>
                <small>{entry.kind} · {entry.action}</small>
              </div>

              <span>{entry.target}</span>

              <button type="button" className="subtle-button" onClick={() => setPermissions((previous) => previous.filter((item) => item.id !== entry.id))}>Revoke</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderPlugins = () => (
    <div className="panel-view marketplace-view">
      <div className="section-topbar">
        <div>
          <div className="section-kicker">Marketplace</div>
          <h2>Plugin Marketplace</h2>
          <p className="marketplace-intro">Small, focused extensions for your local Aetherium workspace.</p>
        </div>
        <span className="marketplace-count">{installedPlugins.length} installed</span>
      </div>

      <div className="plugin-grid">
        {pluginCatalog.map((plugin) => {
          const installed = installedPlugins.includes(plugin.id)
          return (
            <article className={`plugin-card ${installed ? 'installed' : ''}`} key={plugin.id}>
              <div className="plugin-icon">{plugin.name.charAt(0)}</div>
              <div className="plugin-card-copy">
                <div className="plugin-title-row">
                  <h3>{plugin.name}</h3>
                  <span>v{plugin.version}</span>
                </div>
                <div className="plugin-category">{plugin.category}</div>
                <p>{plugin.description}</p>
              </div>
              <div className="plugin-actions">
                <button type="button" className={installed ? 'subtle-button' : 'send-button'} onClick={() => togglePlugin(plugin.id)}>
                  {installed ? 'Uninstall' : 'Install'}
                </button>
                {installed && <button type="button" className="subtle-button" onClick={() => { setDraft(plugin.command); setView('Conversation') }}>Use</button>}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )

  const renderProfile = () => (
    <div className="panel-view profile-view">
      <div className="section-topbar">
        <div>
          <div className="section-kicker">Profile</div>
          <h2>Profile settings</h2>
        </div>
      </div>

      <form className="settings-form profile-form" onSubmit={saveProfile}>
        <div className="profile-avatar">{(activeUser?.name || 'A').charAt(0).toUpperCase()}</div>
        <div className="form-grid">
          <label>
            Display name
            <input value={profileDraft} onChange={(event) => setProfileDraft(event.target.value)} />
          </label>

          <label>
            Email address
            <input value={activeUser?.email || ''} readOnly />
          </label>
        </div>

        <div className="form-actions">
          <button type="submit" className="send-button">Save changes</button>
          <button type="button" className="subtle-button" onClick={handleSignOut}>Sign out</button>
        </div>
      </form>

      <div className="preference-section">
        <div className="section-kicker">Themes</div>
        <h3>Choose your colors</h3>
        <div className="theme-grid">
          {themes.map((option) => (
            <button
              type="button"
              key={option.id}
              className={`theme-option ${theme === option.id ? 'selected' : ''}`}
              onClick={() => setTheme(option.id)}
            >
              <span className="theme-swatches">
                {option.colors.map((color) => <span key={color} style={{ backgroundColor: color }} />)}
              </span>
              <strong>{option.label}</strong>
            </button>
          ))}
        </div>
      </div>

      <div className="preference-section">
        <div className="section-kicker">Layouts</div>
        <h3>Choose your workspace arrangement</h3>
        <div className="layout-grid">
          {layouts.map((option) => (
            <button
              type="button"
              key={option.id}
              className={`layout-option ${layout === option.id ? 'selected' : ''}`}
              onClick={() => setLayout(option.id)}
            >
              <span className={`layout-preview preview-${option.id}`} aria-hidden="true"><i /><i /><i /></span>
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  const renderOpenCode = () => (
    <div className="opencode-screen">
      <div className="opencode-topline">
        <button type="button" className="opencode-sidebar-toggle" onClick={() => setOpenCodeSidebarVisible((previous) => !previous)} aria-label={openCodeSidebarVisible ? 'Hide sidebar' : 'Show sidebar'}>
          {openCodeSidebarVisible ? '‹' : '›'}
        </button>
        <span>aetherium 0.1.0</span>
        <span className="opencode-cwd">~/Aetherium</span>
      </div>

      <div className="opencode-output">
        {activeConversation?.messages?.length ? activeConversation.messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`opencode-message ${message.role}`}>
            <span className="opencode-prefix">{message.role === 'assistant' ? 'Aetherium' : '>'}</span>
            <span>{message.text}</span>
          </div>
        )) : (
          <div className="opencode-welcome">
            <span className="opencode-prefix">&gt;</span>
            <span>Ready. Ask Aetherium to inspect, build, or change your project.</span>
          </div>
        )}
      </div>

      <div className="opencode-input-row">
        <span className="opencode-prompt">&gt;</span>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="enter a prompt"
          rows={1}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              sendPrompt()
            }
          }}
        />
        <button type="button" className="opencode-send" onClick={sendPrompt} disabled={isGenerating || !draft.trim()} aria-label="Send prompt">↵</button>
      </div>

      <div className="opencode-statusbar">
        <span>aetherium 0.1.0</span>
        <span>~/Aetherium</span>
        <button type="button" className="opencode-model" onClick={() => setView('Models')}>
          {activeModel?.name || 'No model selected'}
        </button>
        <span>{isGenerating ? 'PROCESSING' : 'READY'}</span>
      </div>
    </div>
  )

  const renderMain = () => {
    if (view === 'Models') return renderModels()
    if (view === 'Plugins') return renderPlugins()
    if (view === 'Tools') return renderTools()
    if (view === 'Commands') return renderCommands()
    if (view === 'Permissions') return renderPermissions()
    if (view === 'Profile') return renderProfile()
    if (layout === 'code' && (view === 'Home' || view === 'Conversation')) return renderOpenCode()
    if (layout === 'flow' && view === 'Home') return renderHome()
    if (view === 'Conversation') return renderConversation()
    if (view === 'Home') return renderHome()
    if (activeConversation) return renderConversation()
    return renderHome()
  }

  const handleAuthSubmit = async (event) => {
    event.preventDefault()
    const email = authForm.email.trim().toLowerCase()
    const password = authForm.password.trim()
    const name = authForm.name.trim()

    if (authMode === 'signup') {
      if (!name || !email || !password || !authForm.confirmPassword) {
        setAuthError('Complete all signup details.')
        return
      }

      if (password.length < 6) {
        setAuthError('Use a password with at least 6 characters.')
        return
      }

      if (password !== authForm.confirmPassword) {
        setAuthError('Passwords do not match.')
        return
      }

      if (accounts.some((account) => account.email === email)) {
        setAuthError('An account with that email already exists.')
        return
      }

      const id = crypto.randomUUID()
      const salt = window.crypto.getRandomValues(new Uint8Array(16))
      const { key, verifier } = await deriveUserKey(password, salt)
      const newAccount = {
        id,
        email,
        salt: toBase64(salt),
        verifier,
      }
      const newUser = {
        id,
        email,
        name,
      }

      setAccounts((previous) => [...previous, newAccount])
      setActiveUser(newUser)
      setSessionKey(key)
      setSessionPassword(password)
      setHydratedUserId(id)
      const initialData = JSON.stringify({ profile: { name, email }, installedPlugins: [] })
      if (isTauri()) {
        await saveNative('save_user_record', { userId: id, password, data: initialData })
      } else {
        await encryptUserData({ profile: { name, email } }, key).then((encrypted) => window.localStorage.setItem(getUserStorageKey(id), encrypted))
      }
      setAuthError('')
      setAuthForm({ name: '', email: '', password: '', confirmPassword: '' })
      setShowOnboarding(true)
      return
    }

    if (!email || !password) {
      setAuthError('Enter your email and password.')
      return
    }

    const account = accounts.find((accountEntry) => accountEntry.email === email)
    const legacyUser = legacyUsers.find((userEntry) => userEntry.email?.toLowerCase() === email)

    if (!account && !legacyUser) {
      setAuthError('Incorrect email or password.')
      return
    }

    if (!account && legacyUser?.password !== password) {
      setAuthError('Incorrect email or password.')
      return
    }

    if (!account && legacyUser) {
      const migrated = await Promise.all(legacyUsers.map(async (userEntry) => {
        const id = userEntry.id || crypto.randomUUID()
        const salt = window.crypto.getRandomValues(new Uint8Array(16))
        const { key, verifier } = await deriveUserKey(userEntry.password, salt)
        const migratedUser = { id, email: userEntry.email.toLowerCase(), name: userEntry.name || userEntry.email.split('@')[0] }
        const workspaceData = { profile: migratedUser, models: [], selectedModelId: null, tools: defaultTools, conversations: [], activeConversationId: null, commands: [], permissions: [], filesystemRoots: ['/Users/alex/Projects'], installedPlugins: [] }
        const encryptedData = await encryptUserData(workspaceData, key)
        if (isTauri()) {
          await saveNative('save_user_record', { userId: id, password: userEntry.password, data: JSON.stringify(workspaceData) })
        } else {
          window.localStorage.setItem(getUserStorageKey(id), encryptedData)
        }
        return { account: { id, email: migratedUser.email, salt: toBase64(salt), verifier }, user: migratedUser, key }
      }))
      const current = migrated.find((entry) => entry.user.email === email)
      setAccounts(migrated.map((entry) => entry.account))
      setActiveUser(current.user)
      setSessionKey(current.key)
      setSessionPassword(password)
      setHydratedUserId(current.user.id)
      window.localStorage.removeItem(STORAGE_KEYS.legacyUsers)
      LEGACY_DATA_KEYS.forEach((key) => window.localStorage.removeItem(key))
      migrated.forEach((entry) => {
        window.localStorage.removeItem(`aetherium.models.${entry.user.id}`)
        window.localStorage.removeItem(`aetherium.selected-model.${entry.user.id}`)
      })
      setAuthError('')
      setAuthForm({ name: '', email: '', password: '', confirmPassword: '' })
      setView('Home')
      return
    }

    const salt = fromBase64(account.salt)
    const { key, verifier } = await deriveUserKey(password, salt)

    if (verifier !== account.verifier) {
      setAuthError('Incorrect email or password.')
      return
    }

    const foundUser = { id: account.id, email: account.email, name: email.split('@')[0] }
    setActiveUser(foundUser)
    setSessionKey(key)
    setSessionPassword(password)
    setHydratedUserId(null)
    setAuthError('')
    setAuthForm({ name: '', email: '', password: '', confirmPassword: '' })
    setShowOnboarding(false)
    setView('Home')
  }

  const handleSignOut = () => {
    setActiveUser(null)
    setSessionKey(null)
    setSessionPassword(null)
    setHydratedUserId(null)
    setAuthMode('signin')
    setAuthError('')
    setView('Home')
    setDraft('')
  }

  if (!activeUser) {
    return (
      <div className="auth-shell">
        <div className="auth-panel">
          <div className="auth-brand-row">
            <img src={logoUrl} alt="Aetherium logo" className="sidebar-logo" />
            <div className="brand-wordmark">Aetherium</div>
          </div>

          <div className="auth-copy">
            <div className="section-kicker">Workspace access</div>
            <h1>{authMode === 'signin' ? 'Welcome back.' : 'Create your workspace.'}</h1>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {authMode === 'signup' && (
              <label>
                Full name
                <input
                  value={authForm.name}
                  onChange={(event) => setAuthForm((previous) => ({ ...previous, name: event.target.value }))}
                  placeholder="Alex Morgan"
                />
              </label>
            )}

            <label>
              Email
              <input
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthForm((previous) => ({ ...previous, email: event.target.value }))}
                placeholder="you@example.com"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthForm((previous) => ({ ...previous, password: event.target.value }))}
                placeholder="At least 6 characters"
              />
            </label>

            {authMode === 'signup' && (
              <label>
                Confirm password
                <input
                  type="password"
                  value={authForm.confirmPassword}
                  onChange={(event) => setAuthForm((previous) => ({ ...previous, confirmPassword: event.target.value }))}
                  placeholder="Repeat your password"
                />
              </label>
            )}

            {authError && <div className="auth-error">{authError}</div>}

            <button type="submit" className="send-button auth-submit">
              {authMode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="auth-switcher">
            <span>{authMode === 'signin' ? 'Need an account?' : 'Already have an account?'}</span>
            <button
              type="button"
              className="subtle-button"
              onClick={() => {
                setAuthMode((previous) => (previous === 'signin' ? 'signup' : 'signin'))
                setAuthError('')
              }}
            >
              {authMode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`app-shell theme-${theme} layout-${layout} ${openCodeSidebarVisible ? 'code-sidebar-open' : ''}`}>
      <aside className="sidebar">
        {layout === 'legacy-flow' ? (
          <div className="gemini-sidebar-content">
            <div className="gemini-sidebar-brand"><span className="brand-mark-small">A</span><span>Aetherium</span></div>
            <button type="button" className="gemini-new-chat" onClick={() => {
              const conversation = newEmptyConversation('New conversation')
              setConversations((previous) => [conversation, ...previous])
              setActiveConversationId(conversation.id)
              setView('Conversation')
            }}>◌ <span>New chat</span></button>
            <button type="button" className="gemini-side-link" onClick={() => handleGeminiSidebarAction('search')}>⌕ <span>Search chats</span></button>
            <button type="button" className="gemini-side-link" onClick={() => handleGeminiSidebarAction('images')}>▧ <span>Images</span></button>
            <button type="button" className="gemini-side-link" onClick={() => handleGeminiSidebarAction('library')}>⠿ <span>Library</span></button>
            <button type="button" className="gemini-side-link" onClick={() => setView('Plugins')}>⌘ <span>Plugin marketplace</span></button>
            <button type="button" className="gemini-side-link marketplace-disabled" disabled>◈ <span>AI model marketplace</span></button>
            <div className="gemini-side-label">Notebooks</div>
            <button type="button" className="gemini-side-link" onClick={() => handleGeminiSidebarAction('notebook')}>＋ <span>New notebook</span></button>
            <div className="gemini-side-label">Recents</div>
            <div className="gemini-recent-list">
              {conversations.slice(0, 4).map((conversation) => (
                <button type="button" key={conversation.id} onClick={() => { setActiveConversationId(conversation.id); setView('Conversation') }}>{conversation.title}</button>
              ))}
            </div>
            <div className="gemini-sidebar-bottom">
              <button type="button" className="gemini-side-link" onClick={() => handleGeminiSidebarAction('activity')}>◷ <span>Activity</span></button>
              <div className="gemini-profile-row">
                <span className="gemini-avatar">{(activeUser?.name || 'A').charAt(0).toUpperCase()}</span>
                <span>{activeUser?.name || 'User'}</span>
                <button type="button" onClick={() => setView('Profile')} aria-label="Open profile settings">⚙</button>
              </div>
            </div>
          </div>
        ) : (
        <>
        <div className="brand-block">
          <img src={logoUrl} alt="Aetherium logo" className="sidebar-logo" />
          <div className="brand-wordmark">Aetherium</div>
        </div>

        <button type="button" className="new-button" onClick={() => {
          const conversation = newEmptyConversation('New conversation')
          setConversations((previous) => [conversation, ...previous])
          setActiveConversationId(conversation.id)
          setView('Conversation')
        }}>+ New</button>

        <nav className="nav-list" aria-label="Sidebar navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${view === item.id ? 'active' : ''} ${item.disabled ? 'disabled' : ''}`}
              disabled={item.disabled}
              onClick={() => setView(item.id)}
            >
              <span className="nav-visual" aria-hidden="true">•</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="conversation-section">
          <div className="section-label">Conversations</div>

          <div className="conversation-list">
            {conversations.length === 0 ? (
              <div className="empty-conversation-note">No chats yet.</div>
            ) : (
              conversations.map((conversation) => (
                <div key={conversation.id} className="conversation-row-wrap">
                  <button
                    type="button"
                    className={`conversation-row ${activeConversationId === conversation.id ? 'selected' : ''}`}
                    onClick={() => {
                      setActiveConversationId(conversation.id)
                      setView('Conversation')
                    }}
                  >
                    {conversation.title}
                  </button>
                  <button
                    type="button"
                    className="remove-chat"
                    aria-label={`Remove ${conversation.title}`}
                    onClick={() => {
                      setConversations((previous) => previous.filter((item) => item.id !== conversation.id))
                      if (activeConversationId === conversation.id) {
                        setActiveConversationId(null)
                      }
                    }}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="sidebar-footer">
          <button type="button" className="nav-item small" onClick={() => setShowOnboarding(true)}>First-time guide</button>
          <button type="button" className={`nav-item small ${view === 'Profile' ? 'active' : ''}`} onClick={() => setView('Profile')}>Profile settings</button>
        </div>
        </>
        )}
      </aside>

      <main className="workspace-panel">
        <div className="workspace-actions">
          {view !== 'Home' && <button type="button" className="workspace-action" onClick={() => setView('Home')}>Return to Home</button>}
          {layout === 'focus' && <button type="button" className="workspace-action focus-exit" onClick={() => { setLayout('gemini'); setView('Home') }}>Exit focus</button>}
        </div>
        <div key={view} className="page-shell">
          {renderMain()}
        </div>
      </main>

      {showOnboarding && (
        <div className="permission-overlay" role="dialog" aria-modal="true">
          <div className="permission-dialog onboarding-dialog">
            <div className="permission-title">First-time setup</div>

            <div className="onboarding-steps">
              <div className="onboarding-step">
                <span>1</span>
                <div>
                  <strong>Set your name</strong>
                  <input
                    value={profileDraft}
                    onChange={(event) => setProfileDraft(event.target.value)}
                    placeholder="Your name"
                  />
                </div>
              </div>

              <div className="onboarding-step">
                <span>2</span>
                <div>
                  <strong>Register a model</strong>
                  <p>Use an Anthropic, OpenAI-compatible, or local endpoint with your API key and model ID.</p>
                </div>
              </div>

              <div className="onboarding-step">
                <span>3</span>
                <div>
                  <strong>Review permissions</strong>
                  <p>Decide which tools can access your filesystem, terminal, or web requests before you start.</p>
                </div>
              </div>
            </div>

            <div className="permission-actions">
              <button type="button" className="subtle-button" onClick={() => setShowOnboarding(false)}>Skip</button>
              <button type="button" className="send-button" onClick={() => {
                const nextName = (profileDraft || '').trim() || activeUser?.name || 'Alex'
                const updatedUser = { ...activeUser, name: nextName }
                setAccounts((previous) => previous)
                setActiveUser(updatedUser)
                setModels((previous) => previous)
                setShowOnboarding(false)
              }}>Continue</button>
            </div>
          </div>
        </div>
      )}

      {pendingPermission && (
        <div className="permission-overlay" role="dialog" aria-modal="true">
          <div className="permission-dialog">
            <div className="permission-title">{pendingPermission.title}</div>

            <div className="permission-body">
              <div className="permission-kind">{pendingPermission.kind}</div>
              <div className="permission-target">{pendingPermission.target}</div>
              <div className="permission-detail">{pendingPermission.detail}</div>
            </div>

            <div className="permission-actions">
              <button type="button" className="subtle-button" onClick={() => handlePermissionDecision(false)}>Deny</button>
              <button type="button" className="subtle-button" onClick={() => handlePermissionDecision(true, 'once')}>Allow once</button>
              <button type="button" className="send-button" onClick={() => handlePermissionDecision(true, 'session')}>Allow for session</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
