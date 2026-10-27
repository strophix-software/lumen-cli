import { useState, useEffect } from 'react';

export interface Use{{Name}}Result<T = unknown> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export function use{{Name}}<T = unknown>(): Use{{Name}}Result<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;

    fetch('/api/{{nameKebab}}')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch {{name}}: ${res.statusText}`);
        }
        return res.json() as Promise<T>;
      })
      .then((result) => {
        if (active) {
          setData(result);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return {
    data,
    loading,
    error,
  };
}

export default use{{Name}};
