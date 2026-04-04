// ============================================================
// Instructor Contract Service – Scheinselbständigkeit-Prävention
// ============================================================
// Das "Herrenberg-Urteil" (2022) hat die Branche erschüttert:
// Honorarkräfte an Musik-/Tanzschulen können als scheinselbständig
// eingestuft werden → Nachzahlung von Sozialversicherung.
//
// Übergangsfrist bis 31.12.2026.
// Ab 01.01.2027: Rückwirkende SV-Beiträge werden durchgesetzt.
//
// Dieser Service hilft Providern:
// 1. Vertragsarten korrekt zu dokumentieren
// 2. Freelance-Indikatoren nachzuweisen
// 3. Fristen im Blick zu behalten
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type { InstructorContract, ContractType, ContractStatus, Currency, ID } from '../types'

export interface CreateContractInput {
  providerId: ID
  teamMemberId: ID
  type: ContractType
  title: string
  startDate: string
  endDate?: string
  compensation: {
    type: 'hourly' | 'monthly' | 'per_session' | 'per_student'
    amount: number
    currency?: Currency
  }
  hoursPerWeek?: number
  taxId?: string
  freelanceIndicators?: InstructorContract['freelanceIndicators']
}

export const ContractService = {

  create(input: CreateContractInput): InstructorContract {
    const id = generateId('contr')
    const now = new Date()

    const contract: InstructorContract = {
      id,
      providerId: input.providerId,
      teamMemberId: input.teamMemberId,
      type: input.type,
      title: input.title,
      startDate: input.startDate,
      endDate: input.endDate,
      status: 'draft',
      compensation: {
        ...input.compensation,
        currency: input.compensation.currency ?? 'EUR',
      },
      hoursPerWeek: input.hoursPerWeek,
      taxId: input.taxId,
      freelanceIndicators: input.freelanceIndicators,
      createdAt: now,
      updatedAt: now,
    }

    store.state.instructorContracts.set(id, contract)
    store.addToIndex(store.indexes.contractsByProvider, input.providerId, id)
    store.addToIndex(store.indexes.contractsByTeamMember, input.teamMemberId, id)

    return contract
  },

  getById(id: ID): InstructorContract | undefined {
    return store.state.instructorContracts.get(id)
  },

  listByProvider(providerId: ID, filters?: { type?: ContractType; status?: ContractStatus }): InstructorContract[] {
    const ids = store.getFromIndex(store.indexes.contractsByProvider, providerId)
    let result = Array.from(ids)
      .map((id) => store.state.instructorContracts.get(id)!)
      .filter(Boolean)

    if (filters?.type) result = result.filter((c) => c.type === filters.type)
    if (filters?.status) result = result.filter((c) => c.status === filters.status)

    return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  },

  getByTeamMember(teamMemberId: ID): InstructorContract[] {
    const ids = store.getFromIndex(store.indexes.contractsByTeamMember, teamMemberId)
    return Array.from(ids)
      .map((id) => store.state.instructorContracts.get(id)!)
      .filter(Boolean)
  },

  activate(id: ID): InstructorContract | undefined {
    const contract = store.state.instructorContracts.get(id)
    if (!contract) return undefined
    contract.status = 'active'
    contract.updatedAt = new Date()
    return contract
  },

  terminate(id: ID): InstructorContract | undefined {
    const contract = store.state.instructorContracts.get(id)
    if (!contract) return undefined
    contract.status = 'terminated'
    contract.updatedAt = new Date()
    return contract
  },

  // --- Scheinselbständigkeit-Check ---

  // Risiko-Score berechnen: Wie hoch ist das Risiko, dass ein
  // Freelancer als scheinselbständig eingestuft wird?
  assessFreelanceRisk(id: ID): {
    riskLevel: 'low' | 'medium' | 'high' | 'critical'
    score: number          // 0-100 (höher = riskanter)
    positiveIndicators: string[]
    negativeIndicators: string[]
    recommendations: string[]
  } {
    const contract = store.state.instructorContracts.get(id)
    if (!contract || contract.type !== 'freelance') {
      return {
        riskLevel: 'low',
        score: 0,
        positiveIndicators: ['Kein Freelance-Vertrag'],
        negativeIndicators: [],
        recommendations: [],
      }
    }

    const indicators = contract.freelanceIndicators
    const positive: string[] = []
    const negative: string[] = []
    const recommendations: string[] = []
    let riskPoints = 0

    if (!indicators) {
      return {
        riskLevel: 'critical',
        score: 90,
        positiveIndicators: [],
        negativeIndicators: ['Keine Freelance-Indikatoren dokumentiert'],
        recommendations: [
          'Dringend Freelance-Indikatoren dokumentieren',
          'Prüfen ob Festanstellung sinnvoller wäre',
          'Rechtliche Beratung einholen (Übergangsfrist bis 31.12.2026)',
        ],
      }
    }

    // Positive Indikatoren (sprechen FÜR echte Selbständigkeit)
    if (indicators.ownSchedule) {
      positive.push('Bestimmt eigene Arbeitszeiten')
    } else {
      negative.push('Arbeitszeiten werden vorgegeben')
      riskPoints += 15
    }

    if (indicators.ownStudents) {
      positive.push('Hat eigenen Kundenstamm')
    } else {
      negative.push('Arbeitet nur mit zugewiesenen Teilnehmern')
      riskPoints += 20
    }

    if (indicators.ownMaterials) {
      positive.push('Nutzt eigene Arbeitsmittel')
    } else {
      negative.push('Nutzt ausschließlich Materialien des Auftraggebers')
      riskPoints += 10
    }

    if (indicators.multipleClients) {
      positive.push('Arbeitet für mehrere Auftraggeber')
    } else {
      negative.push('Hat nur einen Auftraggeber')
      riskPoints += 25
    }

    if (indicators.substitutionRight) {
      positive.push('Darf Vertretung schicken')
    } else {
      negative.push('Muss persönlich erscheinen, keine Vertretung erlaubt')
      riskPoints += 15
    }

    if (indicators.noInstructions) {
      positive.push('Keine Weisungsgebundenheit im Detail')
    } else {
      negative.push('Weisungsgebunden (Methodik, Ablauf vorgegeben)')
      riskPoints += 15
    }

    if (indicators.ownLocation) {
      positive.push('Hat (teilweise) eigene Räumlichkeiten')
    } else {
      riskPoints += 5
    }

    // Stunden pro Woche als Indikator
    if (contract.hoursPerWeek && contract.hoursPerWeek > 20) {
      negative.push(`Arbeitet ${contract.hoursPerWeek}h/Woche – eher Vollzeit-Charakter`)
      riskPoints += 10
    }

    // Risiko-Level bestimmen
    let riskLevel: 'low' | 'medium' | 'high' | 'critical'
    if (riskPoints <= 20) riskLevel = 'low'
    else if (riskPoints <= 45) riskLevel = 'medium'
    else if (riskPoints <= 70) riskLevel = 'high'
    else riskLevel = 'critical'

    // Empfehlungen
    if (riskLevel === 'critical' || riskLevel === 'high') {
      recommendations.push(
        'Dringend rechtliche Beratung einholen',
        'Prüfen ob Festanstellung oder Mini-Job sinnvoller wäre',
        'Vertrag anpassen um Selbständigkeit besser zu dokumentieren',
        'Übergangsfrist bis 31.12.2026 nutzen'
      )
    } else if (riskLevel === 'medium') {
      recommendations.push(
        'Freelance-Indikatoren stärken (z.B. weitere Auftraggeber dokumentieren)',
        'Vertrag regelmäßig prüfen lassen'
      )
    }

    return {
      riskLevel,
      score: Math.min(100, riskPoints),
      positiveIndicators: positive,
      negativeIndicators: negative,
      recommendations,
    }
  },

  // Übersicht: Alle Freelancer mit ihrem Risiko-Score
  getProviderRiskOverview(providerId: ID): Array<{
    teamMemberId: ID
    teamMemberName: string
    contractType: ContractType
    riskLevel: string
    riskScore: number
  }> {
    const contracts = this.listByProvider(providerId, { status: 'active' })

    return contracts.map((contract) => {
      const member = store.state.teamMembers.get(contract.teamMemberId)
      const risk = this.assessFreelanceRisk(contract.id)

      return {
        teamMemberId: contract.teamMemberId,
        teamMemberName: member?.name ?? 'Unbekannt',
        contractType: contract.type,
        riskLevel: risk.riskLevel,
        riskScore: risk.score,
      }
    }).sort((a, b) => b.riskScore - a.riskScore)
  },

  // Deadline-Warnung: Übergangsfrist
  getTransitionDeadlineWarning(): {
    deadline: string
    daysRemaining: number
    urgent: boolean
    message: string
  } {
    const deadline = new Date('2026-12-31')
    const now = new Date()
    const daysRemaining = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    return {
      deadline: '2026-12-31',
      daysRemaining: Math.max(0, daysRemaining),
      urgent: daysRemaining < 180,
      message: daysRemaining > 0
        ? `Übergangsfrist Scheinselbständigkeit endet in ${daysRemaining} Tagen (31.12.2026). Prüfen Sie alle Honorarverträge.`
        : 'Übergangsfrist abgelaufen! Rückwirkende SV-Beiträge können durchgesetzt werden.',
    }
  },

  delete(id: ID): boolean {
    const contract = store.state.instructorContracts.get(id)
    if (!contract) return false

    store.removeFromIndex(store.indexes.contractsByProvider, contract.providerId, id)
    store.removeFromIndex(store.indexes.contractsByTeamMember, contract.teamMemberId, id)
    return store.state.instructorContracts.delete(id)
  },
}
