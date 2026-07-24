'use client';

import { useParams } from 'next/navigation';
import { MiniAppContainer } from '@/components/MiniAppContainer';

/**
 * Mini App Loader Page
 *
 * Shell-owned route that loads vendor mini apps via the Runtime Loader.
 * Communication flows through Shell Communicator.
 */
export default function MiniAppLoader() {
  const params = useParams();
  const slug = params.slug as string;
  return <MiniAppContainer moduleId={slug} />;
}
