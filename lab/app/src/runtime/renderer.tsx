import type { Page, ComponentInstance, Button } from './types';

export function PageRenderer({
  page,
  onAction,
}: {
  page: Page;
  onAction: (a: Button['action']) => void;
}) {
  if (!page?.components?.length) return <div className="p-6">Empty page</div>;
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      {page.components.map((c, i) => (
        <Component key={i} c={c} onAction={onAction} />
      ))}
    </div>
  );
}

function Component({ c, onAction }: { c: ComponentInstance; onAction: (a: Button['action']) => void }) {
  switch (c.type) {
    case 'text':
      return <p className="text-lg">{c.props.text}</p>;
    case 'buttons':
      return (
        <div className="flex gap-3">
          {c.props.buttons.map((b) => (
            <button
              key={b.id}
              className="px-4 py-2 rounded bg-black text-white hover:opacity-90"
              onClick={() => onAction(b.action)}
            >
              {b.text}
            </button>
          ))}
        </div>
      );
    default:
      return <div>Unknown component: {String((c as any).type)}</div>;
  }
}
