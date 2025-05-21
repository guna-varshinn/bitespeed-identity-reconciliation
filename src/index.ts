import 'reflect-metadata';
import { createConnection, getRepository } from 'typeorm';
import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { Contact } from './entity/Contact';

const app = express();
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

createConnection().then(() => {
  app.listen(process.env.PORT || 3000, () => {
    console.log('Server running on port 3000');
  });
});

app.post('/identify', async (req: Request, res: Response) => {
  const { email, phoneNumber } = req.body;

  if (!email && !phoneNumber) {
    return res.status(400).json({ error: 'Either email or phoneNumber must be provided' });
  }

  const contactRepository = getRepository(Contact);

  try {
    const contacts = await contactRepository.find({
      where: [
        { email: email || undefined },
        { phoneNumber: phoneNumber?.toString() || undefined }
      ]
    });

    const primaries = new Map<number, Contact>();
    for (const contact of contacts) {
      let current = contact;
      while (current.linkPrecedence === 'secondary' && current.linkedId !== null) {
        const linkedContact = await contactRepository.findOne(current.linkedId);
        if (!linkedContact) break;
        current = linkedContact;
      }
      if (current.linkPrecedence === 'primary') {
        primaries.set(current.id, current);
      }
    }

    let mainPrimary: Contact;

    if (primaries.size === 0) {
      const newContact = contactRepository.create({
        email,
        phoneNumber: phoneNumber?.toString(),
        linkPrecedence: 'primary'
      });
      await contactRepository.save(newContact);
      return res.status(200).json({
        contact: {
          primaryContactId: newContact.id,
          emails: newContact.email ? [newContact.email] : [],
          phoneNumbers: newContact.phoneNumber ? [newContact.phoneNumber] : [],
          secondaryContactIds: []
        }
      });
    } else {
      const sortedPrimaries = Array.from(primaries.values()).sort(
        (a: Contact, b: Contact) => a.createdAt.getTime() - b.createdAt.getTime()
      );
      mainPrimary = sortedPrimaries[0];
      const otherPrimaries = sortedPrimaries.slice(1);

      for (const primary of otherPrimaries) {
        primary.linkPrecedence = 'secondary';
        primary.linkedId = mainPrimary.id;
        await contactRepository.save(primary);

        const linkedContacts = await contactRepository.find({ where: { linkedId: primary.id } });
        for (const linkedContact of linkedContacts) {
          linkedContact.linkedId = mainPrimary.id;
          await contactRepository.save(linkedContact);
        }
      }

      const groupContacts = await contactRepository.find({
        where: [
          { id: mainPrimary.id },
          { linkedId: mainPrimary.id }
        ]
      });

      const existingEmails = new Set(
        groupContacts.map((c: Contact) => c.email).filter((e: any): e is string => !!e)
      );
      const existingPhones = new Set(
        groupContacts.map((c: Contact) => c.phoneNumber).filter((p: any): p is string => !!p)
      );

      const emailExists = email ? existingEmails.has(email) : false;
      const phoneExists = phoneNumber ? existingPhones.has(phoneNumber.toString()) : false;

      if ((email && !emailExists) || (phoneNumber && !phoneExists)) {
        const newSecondary = contactRepository.create({
          email,
          phoneNumber: phoneNumber?.toString(),
          linkedId: mainPrimary.id,
          linkPrecedence: 'secondary'
        });
        await contactRepository.save(newSecondary);
      }

      const updatedGroupContacts = await contactRepository.find({
        where: [
          { id: mainPrimary.id },
          { linkedId: mainPrimary.id }
        ],
        order: { createdAt: 'ASC' }
      });

      const emails = Array.from(
        new Set(
          updatedGroupContacts.map((c: Contact) => c.email).filter((e: any): e is string => !!e)
        )
      );
      const primaryEmail = mainPrimary.email;
      if (primaryEmail) {
        emails.unshift(primaryEmail);
        const index = emails.lastIndexOf(primaryEmail);
        if (index !== 0) emails.splice(index, 1);
      }

      const phoneNumbers = Array.from(
        new Set(
          updatedGroupContacts.map((c: Contact) => c.phoneNumber).filter((p: any): p is string => !!p)
        )
      );
      const primaryPhone = mainPrimary.phoneNumber;
      if (primaryPhone) {
        phoneNumbers.unshift(primaryPhone);
        const index = phoneNumbers.lastIndexOf(primaryPhone);
        if (index !== 0) phoneNumbers.splice(index, 1);
      }

      const secondaryContactIds = updatedGroupContacts
        .filter((c: Contact) => c.id !== mainPrimary.id)
        .map((c: Contact) => c.id);

      return res.status(200).json({
        contact: {
          primaryContactId: mainPrimary.id,
          emails: [...new Set(emails)],
          phoneNumbers: [...new Set(phoneNumbers)],
          secondaryContactIds
        }
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
