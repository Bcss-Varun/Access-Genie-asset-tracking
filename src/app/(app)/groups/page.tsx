import { redirect } from 'next/navigation';

/** Groups & Fleets retired — saved views on the Registry do this job, and stay
 *  true as assets are registered and retired (docs/22 §22.4.2). */
export default function GroupsRedirect() {
  redirect('/assets');
}
