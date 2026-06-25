import React from 'react';
import { Phone, MessageSquare, Mail, MessageCircle, MapPin, HelpCircle } from 'lucide-react';

const icons = {
  'Call': Phone,
  'Text': MessageSquare,
  'Email': Mail,
  'WhatsApp': MessageCircle,
  'In-person drop-in': MapPin,
};

export default function ChannelIcon({ channel, className = 'w-4 h-4' }) {
  const Icon = icons[channel] || HelpCircle;
  return <Icon className={className} />;
}
