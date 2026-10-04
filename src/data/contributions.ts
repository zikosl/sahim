import { request, Session } from '../api'
import { Draft } from '../storage'

export async function submitContribution(session: Session, item: Draft, input: Record<string, unknown>) {
  const data = await request<{ submitSahimContribution: { status: string } }>(session,
    'mutation SahimSubmitContribution($id:String!,$kind:String!,$input:String!){submitSahimContribution(localId:$id,kind:$kind,inputJson:$input){status}}',
    { id: item.localId, kind: item.kind, input: JSON.stringify(input) },
  )
  return data.submitSahimContribution.status.toLowerCase() as Draft['status']
}

export async function listContributionStatuses(session: Session) {
  const data = await request<{ mySahimContributions: { localId: string; status: string; reviewNote: string | null }[] }>(session,
    'query SahimContributionStatuses{mySahimContributions{localId status reviewNote}}',
  )
  return data.mySahimContributions
}
