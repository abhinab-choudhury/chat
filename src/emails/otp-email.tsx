import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export interface OtpEmailProps {
  otp: string
  type: 'sign-in' | 'email-verification' | 'forget-password' | 'change-email'
}

const typeLabels: Record<OtpEmailProps['type'], string> = {
  'sign-in': 'sign in',
  'email-verification': 'verify your email',
  'forget-password': 'reset your password',
  'change-email': 'change your email',
}

export function OtpEmail({ otp, type }: OtpEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your one-time code is {otp}</Preview>
      <Body style={{ backgroundColor: '#f6f9fc', fontFamily: 'sans-serif' }}>
        <Container style={{ margin: '0 auto', padding: '20px', maxWidth: '480px' }}>
          <Heading as="h2">Your one-time code</Heading>
          <Text>Use the code below to {typeLabels[type]}:</Text>
          <Section
            style={{
              textAlign: 'center',
              margin: '24px 0',
              padding: '16px',
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              letterSpacing: '8px',
              fontSize: '28px',
              fontWeight: 'bold',
            }}
          >
            {otp}
          </Section>
          <Text style={{ color: '#666', fontSize: '12px' }}>
            This code expires in 5 minutes. If you didn't request it, you can
            ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default OtpEmail