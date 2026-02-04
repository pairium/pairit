import { signIn } from '@app/lib/auth-client'
import { Button } from '@components/ui/Button'

type LoginProps = {
  callbackURL?: string
}

export function Login({ callbackURL }: LoginProps) {
  const handleGoogleLogin = () => {
    signIn.social({
      provider: 'google',
      callbackURL: callbackURL ?? window.location.href,
    })
  }

  return (
    <Button onClick={handleGoogleLogin} variant="ghost">
      Sign in with Google
    </Button>
  )
}
