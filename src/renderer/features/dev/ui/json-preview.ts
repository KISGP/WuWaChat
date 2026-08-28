import { darkStyles } from 'react-json-view-lite'

export const jsonPreviewStyles = {
  ...darkStyles,
  container: 'font-mono text-xs leading-6 text-white/75',
  basicChildStyle: 'px-0.5',
  childFieldsContainer: 'ml-4 border-l border-white/10 pl-3',
  label: 'mr-1 font-medium text-[#e8c690]',
  clickableLabel: 'mr-1 cursor-pointer font-medium text-[#e8c690]',
  nullValue: 'text-white/40',
  undefinedValue: 'text-white/40',
  stringValue: 'text-emerald-200',
  booleanValue: 'text-sky-200',
  numberValue: 'text-violet-200',
  otherValue: 'text-white/65',
  punctuation: 'mr-1 font-semibold text-white/45',
  collapsedContent: 'mr-1 cursor-pointer text-white/35',
  quotesForFieldNames: true,
  stringifyStringValues: true
}
