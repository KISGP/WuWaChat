export type StoryJsonScene = {
  id: string
  title: string
  participants: string[]
  summary: string
  text: string
}

export type StoryJsonTask = {
  id: string
  title: string
  summary: string
  storyParticipants: string[]
  scenes: StoryJsonScene[]
}

export type StoryTaskMetadata = {
  taskKey: string
  taskId: string
  title: string
  summary: string
  sourcePath: string
  participants: string[]
  sceneCount: number
}

export type StorySceneMetadata = {
  sceneKey: string
  taskKey: string
  taskId: string
  sceneId: string
  ordinal: number
  title: string
  summary: string
  participants: string[]
  sourcePath: string
  jsonPointer: string
}

export type StoryScopeResult = {
  characterName: string
  tasks: StoryTaskMetadata[]
  scenes: StorySceneMetadata[]
}

export type StoryEvidence = {
  sceneKey: string
  taskKey: string
  taskId: string
  sceneId: string
  title: string
  participants: string[]
  text: string
  sourcePath: string
  jsonPointer: string
  contentHash: string
}

export type StoryLoadStatus = {
  available: boolean
  sourcePath: string
  sourceFingerprint: string | null
  taskCount: number
  sceneCount: number
  invalidFileCount: number
  message?: string
}
