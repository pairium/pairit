import { signOut } from '@app/lib/auth-client'
import { Button } from '@components/ui/Button'

type LogoutProps = {
  onSuccess?: () => void
}

export function Logout({ onSuccess }: LogoutProps) {
  const handleLogout = async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          onSuccess?.()
        },
      },
    })
  }

  return (
    <Button onClick={handleLogout} variant="ghost">
      Sign out
    </Button>
  )
}
