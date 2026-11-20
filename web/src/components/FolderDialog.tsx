import { ArrowUp, Folder, FolderCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { addProject, fail, useStore } from '../lib/store'
import { Button, Dialog, IconButton, Input } from './ui'

interface Listing {
  path: string
  parent: string
  dirs: { name: string; path: string }[]
  isProject: boolean
}

export default function FolderDialog() {
  const open = useStore((s) => s.dialog === 'folder')
  const root = useStore((s) => s.root)
  const [listing, setListing] = useState<Listing>()
  const [typed, setTyped] = useState('')
  const close = () => useStore.setState({ dialog: undefined })

  const browse = (path?: string) =>
    api<Listing>('GET', `/api/fs${path ? `?path=${encodeURIComponent(path)}` : ''}`).then((l) => {
      setListing(l)
      setTyped(l.path)
    }, fail)

  useEffect(() => {
    if (open) browse(root?.replace(/[\\/][^\\/]*$/, ''))
  }, [open])

  const choose = async (path: string) => {
    try {
      await addProject(path)
      close()
    } catch (e) {
      fail(e)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Open a project folder"
      footer={
        <>
          <span className="mr-auto text-[11px] text-faint">{listing?.isProject ? 'Looks like a project' : ''}</span>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => choose(typed)}>
            Open this folder
          </Button>
        </>
      }
    >
      <div className="space-y-2 p-4">
        <div className="flex gap-1.5">
          <IconButton icon={ArrowUp} label="Parent folder" onClick={() => listing && browse(listing.parent)} className="size-8 border border-line" />
          <Input
            className="font-mono text-[12px]"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && browse(typed)}
          />
        </div>
        <div className="h-72 overflow-y-auto rounded-xl border border-line bg-panel p-1">
          {listing?.dirs.map((d) => (
            <button
              key={d.path}
              onClick={() => browse(d.path)}
              onDoubleClick={() => choose(d.path)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-hover"
            >
              <Folder size={14} className="text-faint" />
              {d.name}
            </button>
          ))}
          {listing && !listing.dirs.length && (
            <div className="flex h-full items-center justify-center gap-2 text-xs text-faint">
              <FolderCheck size={14} /> No subfolders
            </div>
          )}
        </div>
        <p className="text-[11px] text-faint">Click to browse, double-click to open. You can also paste a path and press Enter.</p>
      </div>
    </Dialog>
  )
}
