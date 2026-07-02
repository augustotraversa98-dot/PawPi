import { serializeError } from 'serialize-error';

// Remote logging is a no-op when no endpoint is configured, or when the
// endpoint still points at the defunct Anything platform (a dead third-party
// host — crash logs must not leave the app for it).
const isRemoteLoggingDisabled = () =>
  !process.env.EXPO_PUBLIC_LOGS_ENDPOINT ||
  process.env.EXPO_PUBLIC_LOGS_ENDPOINT.includes('anything.com');

export const sendLogsToRemote = async (logs) => {
  if (
    isRemoteLoggingDisabled() ||
    !process.env.EXPO_PUBLIC_PROJECT_GROUP_ID ||
    !process.env.EXPO_PUBLIC_CREATE_TEMP_API_KEY
  ) {
    return { success: false };
  }
  try {
    const response = await fetch(process.env.EXPO_PUBLIC_LOGS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.EXPO_PUBLIC_CREATE_TEMP_API_KEY}`,
      },
      body: JSON.stringify({
        projectGroupId: process.env.EXPO_PUBLIC_PROJECT_GROUP_ID,
        logs,
      }),
    });
    if (!response.ok) {
      return { success: false };
    }
  } catch (fetchError) {
    return { success: false, error: fetchError };
  }
  return { success: true };
};

export const reportErrorToRemote = async ({ error }) => {
  if (
    isRemoteLoggingDisabled() ||
    !process.env.EXPO_PUBLIC_PROJECT_GROUP_ID ||
    !process.env.EXPO_PUBLIC_CREATE_TEMP_API_KEY
  ) {
    console.debug(
      'reportErrorToRemote: remote logging disabled or not configured; error stays local.',
      error
    );
    return { success: false };
  }
  return sendLogsToRemote([
    {
      message: JSON.stringify(serializeError(error)),
      timestamp: new Date().toISOString(),
      level: 'error',
      source: 'BUILDER',
      devServerId: process.env.EXPO_PUBLIC_DEV_SERVER_ID,
    },
  ]);
};
