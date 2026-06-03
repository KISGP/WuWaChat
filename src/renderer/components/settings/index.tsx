import { type ReactElement, useState } from 'react'
import SettingIcon from '../../assets/settingIcon.png'
import CloseIcon from '../close'
import Tab from '../tab'
import { BackgroundTab } from './BackgroundTab'
import { CharacterTab } from './CharacterTab'
import { LogTab } from './LogTab'
import { MemoryTab } from './MemoryTab'
import { ModelTab } from './ModelTab'

const TABS = [
  { id: 'model', label: '模型', component: ModelTab },
  { id: 'memory', label: '记忆', component: MemoryTab },
  { id: 'character', label: '角色', component: CharacterTab },
  { id: 'bg', label: '背景图像', component: BackgroundTab },
  { id: 'log', label: '日志', component: LogTab }
] as const

export default function Settings({ onClose }: { onClose?: () => void }): ReactElement {
  const [activeTab, setActiveTab] = useState<string>(TABS[0].id)

  const handleClose = (): void => {
    if (onClose) {
      onClose()
    } else {
      window.close()
    }
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden font-sans">
      <div data-drag-region className="relative h-16 shrink-0 items-center justify-between">
        <div data-drag-region className="absolute bottom-4 left-6 flex items-center gap-1">
          <img src={SettingIcon} className="size-8 object-contain" alt="" />
          <span className="tracking-wider text-white">设置</span>
        </div>
        <CloseIcon className="absolute right-6 bottom-2" onClick={handleClose} />
      </div>

      <div className="mx-8 mt-2 flex gap-2 border-b border-white/20 pb-2">
        {TABS.map((tab) => (
          <Tab key={tab.id} active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </Tab>
        ))}
      </div>

      <div className="h-148 overflow-hidden">
        {TABS.map(({ id, component: Component }) => (
          <div key={id} className={activeTab === id ? 'h-full' : 'hidden h-full'}>
            <Component />
          </div>
        ))}
      </div>
    </div>
  )
}
