import { defineRuntimeComponent } from '../../runtime/define-runtime-component'
import type { TextComponent } from '../../runtime/types'

export const TextRuntime = defineRuntimeComponent<'text', TextComponent['props']>({
  type: 'text',
  renderer: ({ component }) => {
    const text = component.props.text
    if (!text) {
      return null
    }

    if (component.props.markdown) {
      return <div className="whitespace-pre-wrap text-base leading-relaxed text-slate-700">{text}</div>
    }

    return <p className="text-base text-slate-700">{text}</p>
  },
})

